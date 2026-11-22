import { invoke } from "@tauri-apps/api/core";
import { parseWikiUrl, wikiApiUrl, wikitextToPlain } from "../schema/wikiSource";
import { proxyNow } from "../state/appSettingsStore";

/** Fetches a wiki page (Fandom, Wikipedia or another MediaWiki) as plain text. */
export async function fetchWikiPage(url: string): Promise<{ title: string; text: string }> {
  const ref = parseWikiUrl(url);
  if (!ref) throw new Error("That doesn't look like a wiki page link (…/wiki/Page_name).");
  const proxy = await proxyNow();
  let lastError = "the wiki didn't answer";
  for (const api of ref.apis) {
    const response = await invoke<{ status: number; body: number[] }>("http_download", { url: wikiApiUrl(api, ref.title), proxy });
    if (response.status >= 400) {
      lastError = `the wiki answered ${response.status}`;
      continue;
    }
    let data: { parse?: { title?: string; wikitext?: string }; error?: { info?: string } };
    try {
      data = JSON.parse(new TextDecoder().decode(Uint8Array.from(response.body)));
    } catch {
      lastError = "the wiki sent no usable answer";
      continue;
    }
    if (data.error) throw new Error(`The wiki says: ${data.error.info ?? "page not found"}.`);
    const wikitext = data.parse?.wikitext;
    if (typeof wikitext !== "string") continue;
    const text = wikitextToPlain(wikitext);
    if (!text) throw new Error("The page is empty.");
    return { title: data.parse?.title ?? ref.title, text };
  }
  throw new Error(`The page couldn't be fetched: ${lastError}.`);
}
