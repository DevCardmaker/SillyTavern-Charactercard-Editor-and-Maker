import { invoke } from "@tauri-apps/api/core";
import { extractCardJson } from "../png/characterCard";
import { directDownload, downloadRoute, fileNameFromDisposition, LOREBOOK_FOLDER, safeName } from "../schema/library";
import { parseCardJson, parseCardJsonLeniently, CardParseError } from "../schema/parse";
import { proxyNow } from "../state/appSettingsStore";
import { useSillyTavernStore } from "../state/sillyTavernStore";
import { saveIntoLibrary } from "./library";
import { stCallRaw } from "./sillyTavernClient";

export interface DownloadResult {
  kind: "card" | "lorebook";
  name: string;
  path: string;
  /** The library already had exactly this file. */
  duplicate: boolean;
}

const isPng = (bytes: Uint8Array) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

function cardName(bytes: Uint8Array, png: boolean): string | null {
  const json = png ? extractCardJson(bytes) : new TextDecoder().decode(bytes);
  if (!json) return null;
  try {
    return parseCardJson(json).name;
  } catch (err) {
    const recovered = err instanceof CardParseError && err.issues ? parseCardJsonLeniently(json, err.issues) : null;
    return recovered?.name ?? null;
  }
}

/** Downloads one link into the library: a character into the group folder (or the top level), a
 * lorebook into the "Lorebooks" folder. Throws with a readable reason. */
export async function downloadToLibrary(url: string, group: string | null): Promise<DownloadResult> {
  const route = downloadRoute(url);
  if (!route) throw new Error("not a web address");

  let bytes: Uint8Array;
  let kind: "card" | "lorebook" = "card";
  let suggested: string | null = null;

  if (route === "sillytavern") {
    const config = await useSillyTavernStore.getState().ensureConfig();
    if (!config.baseUrl.trim()) throw new Error("this site is downloaded through SillyTavern — set it up under Settings → SillyTavern first");
    const response = await stCallRaw(config, "/api/content/importURL", { json: { url: url.trim() } });
    // SillyTavern answers 404 for links it can't read and 500 when the site itself said no.
    if (response.status >= 400) {
      throw new Error(
        "SillyTavern couldn't download it — wrong link, removed, private, or blocked in your country (SillyTavern's own proxy setting helps there, see Settings → Library & downloads)",
      );
    }
    bytes = response.body;
    kind = response.headers["x-custom-content-type"] === "lorebook" ? "lorebook" : "card";
    suggested = fileNameFromDisposition(response.headers["content-disposition"]);
  } else {
    const target = directDownload(url);
    const response = await invoke<{ status: number; content_type: string; content_disposition: string | null; body: number[] }>(
      "http_download",
      { url: target.url, proxy: await proxyNow() },
    );
    if (response.status === 404) throw new Error("the site found nothing there (wrong link, removed, or only visible when logged in)");
    if (response.status >= 400) throw new Error(`the site answered ${response.status}`);
    bytes = Uint8Array.from(response.body);
    kind = target.kind;
    suggested = fileNameFromDisposition(response.content_disposition);
  }

  if (kind === "lorebook") {
    // The lorebook's own name first; the download's file name is often just the link's slug.
    let name: string;
    try {
      name = String(JSON.parse(new TextDecoder().decode(bytes)).name ?? "").trim();
    } catch {
      throw new Error("the lorebook couldn't be read");
    }
    name ||= suggested?.replace(/\.[^.]+$/, "") ?? "";
    const saved = await saveIntoLibrary(bytes, `${safeName(name, "lorebook")}.json`, LOREBOOK_FOLDER);
    return { kind, name: name || saved.fileName, path: saved.path, duplicate: saved.duplicate };
  }

  const png = isPng(bytes);
  const name = cardName(bytes, png);
  if (!name && name !== "") {
    const text = png ? "" : new TextDecoder().decode(bytes.slice(0, 200)).trimStart().toLowerCase();
    throw new Error(
      png
        ? "the picture has no character card in it"
        : text.startsWith("<!doctype html") || text.startsWith("<html")
          ? "this link is a web page, not a card file — this site isn't supported yet; use its download link (the address of the PNG or JSON) instead"
          : "this is not a character card",
    );
  }
  const ext = png ? "png" : "json";
  const wanted = suggested && suggested.toLowerCase().endsWith(`.${ext}`) ? suggested : `${safeName(name ?? "", "card")}.${ext}`;
  const saved = await saveIntoLibrary(bytes, wanted, group?.trim() ? group : null);
  return { kind, name: name || saved.fileName, path: saved.path, duplicate: saved.duplicate };
}
