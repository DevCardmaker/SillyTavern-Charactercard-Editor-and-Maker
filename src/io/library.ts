import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { extractCardJson } from "../png/characterCard";
import { LOREBOOK_FOLDER, placeInLibrary, safeName } from "../schema/library";
import { parseCardJson, parseCardJsonLeniently, CardParseError } from "../schema/parse";
import { libraryDirNow } from "../state/appSettingsStore";
import { listDirFiles, readBinary, writeBinary } from "./rawFile";

export interface LibraryCard {
  path: string;
  fileName: string;
  /** The group (subfolder) it's in, null for the library's top level. */
  group: string | null;
  name: string;
  tags: string[];
  /** The PNG itself (for the preview), null for a .json card. */
  png: Uint8Array | null;
}

export interface LibraryLorebook {
  path: string;
  fileName: string;
}

export interface LibraryContent {
  dir: string;
  cards: LibraryCard[];
  groups: { name: string; cards: LibraryCard[] }[];
  lorebooks: LibraryLorebook[];
}

const CARD_FILE = /\.(png|json)$/i;

function readCard(bytes: Uint8Array, isPng: boolean): { name: string; tags: string[] } | null {
  const json = isPng ? extractCardJson(bytes) : new TextDecoder().decode(bytes);
  if (!json) return null;
  try {
    const card = (() => {
      try {
        return parseCardJson(json);
      } catch (err) {
        const recovered = err instanceof CardParseError && err.issues ? parseCardJsonLeniently(json, err.issues) : null;
        if (!recovered) throw err;
        return recovered;
      }
    })();
    return { name: card.name, tags: card.tags ?? [] };
  } catch {
    return null;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await listDirFiles(dir);
  } catch {
    return [];
  }
}

/** A group folder may hold "group.json" with the members' order (written when a GroupX file or
 * open cards are saved as a group) — the order of first messages in a group chat. */
export const GROUP_ORDER_FILE = "group.json";

async function groupOrder(dir: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBinary(await join(dir, GROUP_ORDER_FILE))));
    return Array.isArray(parsed?.order) ? parsed.order.filter((n: unknown): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers the order of a group's files (by file name). */
export async function writeGroupOrder(group: string, fileNames: string[]): Promise<void> {
  const dir = await join(await libraryDirNow(), safeName(group, "group"));
  await writeBinary(await join(dir, GROUP_ORDER_FILE), new TextEncoder().encode(JSON.stringify({ order: fileNames }, null, 2)));
}

async function cardsIn(dir: string, group: string | null): Promise<LibraryCard[]> {
  const cards: LibraryCard[] = [];
  for (const fileName of (await listFiles(dir)).filter((f) => CARD_FILE.test(f) && f !== GROUP_ORDER_FILE).sort()) {
    const path = await join(dir, fileName);
    try {
      const bytes = await readBinary(path);
      const isPng = /\.png$/i.test(fileName);
      const info = readCard(bytes, isPng);
      // Files that aren't character cards (a lorebook export, a plain picture) are left out.
      if (info) cards.push({ path, fileName, group, name: info.name || fileName, tags: info.tags, png: isPng ? bytes : null });
    } catch {
      // Unreadable: skip it.
    }
  }
  const byName = (a: LibraryCard, b: LibraryCard) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const order = group ? await groupOrder(dir) : [];
  if (order.length === 0) return cards.sort(byName);
  // Listed files first, in their order; anything added later by hand after them, by name.
  const rank = (c: LibraryCard) => {
    const i = order.indexOf(c.fileName);
    return i === -1 ? order.length : i;
  };
  return cards.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** Everything in the library: cards at the top level, each subfolder as a group, and the lorebooks
 * in the "Lorebooks" folder. */
export async function scanLibrary(): Promise<LibraryContent> {
  const dir = await libraryDirNow();
  const subdirs = (await invoke<string[]>("list_subdirs", { path: dir })).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  const groups: LibraryContent["groups"] = [];
  for (const name of subdirs.filter((d) => d !== LOREBOOK_FOLDER && !d.startsWith(".") && d !== "backups")) {
    groups.push({ name, cards: await cardsIn(await join(dir, name), name) });
  }
  const lorebookDir = await join(dir, LOREBOOK_FOLDER);
  const lorebooks: LibraryLorebook[] = [];
  for (const fileName of (await listFiles(lorebookDir)).filter((f) => /\.json$/i.test(f)).sort()) {
    lorebooks.push({ path: await join(lorebookDir, fileName), fileName });
  }
  return { dir, cards: await cardsIn(dir, null), groups, lorebooks };
}

/** Writes a file into the library (or a group / the Lorebooks folder in it): the same file again
 * when identical, otherwise under a free name ("Anna-2.png"). */
export async function saveIntoLibrary(
  bytes: Uint8Array,
  wantedName: string,
  folder: string | null,
): Promise<{ path: string; fileName: string; duplicate: boolean }> {
  const root = await libraryDirNow();
  const dir = folder ? await join(root, safeName(folder, "group")) : root;
  const dot = wantedName.lastIndexOf(".");
  const wanted = `${safeName(dot > 0 ? wantedName.slice(0, dot) : wantedName)}${dot > 0 ? wantedName.slice(dot).toLowerCase() : ""}`;
  const base = wanted.replace(/\.[^.]+$/, "").toLowerCase();
  // Only files that could clash need reading.
  const existing = new Map<string, Uint8Array>();
  for (const name of await listFiles(dir)) {
    if (!name.toLowerCase().startsWith(base)) continue;
    try {
      existing.set(name, await readBinary(await join(dir, name)));
    } catch {
      // Unreadable: treat as taken.
      existing.set(name, new Uint8Array());
    }
  }
  const { fileName, duplicate } = placeInLibrary(wanted, existing, bytes);
  const path = await join(dir, fileName);
  await writeBinary(path, bytes);
  return { path, fileName, duplicate };
}
