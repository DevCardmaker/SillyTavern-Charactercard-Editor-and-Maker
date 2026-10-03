import { open, save } from "@tauri-apps/plugin-dialog";
import type { AiLorebookEntryDraft } from "../schema/aiLorebookAssist";
import { lorebookSchema, normalizeWorldInfo, toWorldInfo, type Lorebook, type LorebookEntry } from "../schema/lorebook";
import { useLorebookStore } from "../state/lorebookStore";
import { extractCardJson } from "../png/characterCard";
import { parseCardJson } from "../schema/parse";
import { backupExistingFile } from "./fileIO";
import { readBinary, writeBinary } from "./rawFile";

const LOREBOOK_FILTERS = [{ name: "Lorebook (World Info)", extensions: ["json"] }];

/** Exports a lorebook to a standalone JSON file at a user-chosen path. No-op if the dialog is
 * cancelled — same shape as the card save flows. */
export async function exportLorebook(book: Lorebook): Promise<void> {
  const chosen = await save({
    filters: LOREBOOK_FILTERS,
    defaultPath: book.name ? `${book.name}.json` : "lorebook.json",
  });
  if (!chosen) return;
  await writeBinary(chosen, new TextEncoder().encode(JSON.stringify(book, null, 2)));
}

/** Opens a standalone lorebook JSON file the user picks and returns the validated result, or
 * `null` if the dialog was cancelled. Accepts both V2 `character_book` JSON and SillyTavern's
 * native World Info export (see `normalizeWorldInfo`). Throws (via the schema) if the file isn't a valid
 * lorebook — same "let it throw, caller shows the error banner" pattern as card loading. */
export async function importLorebook(): Promise<Lorebook | null> {
  const selected = await open({ multiple: false, filters: LOREBOOK_FILTERS });
  if (!selected || Array.isArray(selected)) return null;
  return readLorebookAtPath(selected);
}

/** Reads and validates a lorebook JSON file (V2 or SillyTavern World Info). Throws with a
 * readable message if it isn't one. */
export async function readLorebookAtPath(path: string): Promise<Lorebook> {
  const bytes = await readBinary(path);
  const json = JSON.parse(new TextDecoder().decode(bytes));
  const result = lorebookSchema.safeParse(normalizeWorldInfo(json));
  if (!result.success) {
    const fileName = path.split(/[\\/]/).pop();
    throw new Error(`"${fileName}" is not a lorebook (World Info) file.`);
  }
  return result.data;
}

/** Lorebook files and character cards — both can be the source for merging entries. */
const MERGE_SOURCE_FILTERS = [{ name: "Lorebook or character card", extensions: ["json", "png"] }];

/** Picks a file to merge entries from and returns its lorebook: a lorebook file (V2 or SillyTavern
 * World Info) or a character card's embedded lorebook. `null` if the dialog was cancelled; throws
 * with a readable message if the file holds no lorebook. */
export async function pickMergeSource(): Promise<{ book: Lorebook; fileName: string } | null> {
  const selected = await open({ multiple: false, filters: MERGE_SOURCE_FILTERS });
  if (!selected || Array.isArray(selected)) return null;
  const fileName = selected.split(/[\\/]/).pop() ?? selected;
  const bytes = await readBinary(selected);

  let cardJson: string | null;
  if (/\.png$/i.test(selected)) {
    cardJson = extractCardJson(bytes);
  } else {
    const text = new TextDecoder().decode(bytes);
    const asLorebook = lorebookSchema.safeParse(normalizeWorldInfo(JSON.parse(text)));
    if (asLorebook.success) return { book: asLorebook.data, fileName };
    cardJson = text;
  }

  let book: Lorebook | undefined;
  try {
    book = cardJson ? (parseCardJson(cardJson).character_book ?? undefined) : undefined;
  } catch {
    book = undefined;
  }
  if (!book || book.entries.length === 0) throw new Error(`"${fileName}" contains no lorebook entries.`);
  return { book, fileName };
}

/** Lorebooks workspace "Open…": one or more files, each as its own tab. Returns the names of
 * files that couldn't be loaded, so the caller can report them without aborting the rest. */
export async function openLorebookFiles(): Promise<string[]> {
  const selected = await open({ multiple: true, filters: LOREBOOK_FILTERS });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return openLorebookPaths(paths);
}

export async function openLorebookPaths(paths: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const path of paths) {
    try {
      useLorebookStore.getState().loadLorebook(await readLorebookAtPath(path), path);
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err));
    }
  }
  return failed;
}

/** Lorebooks workspace "Save"/"Save As…" for the active tab — always SillyTavern's World Info
 * format (see `toWorldInfo`), with the same `backups/` safety copy as card saves. With no file
 * yet, "Save" behaves like "Save As…". */
export async function saveActiveLorebook(mode: "save" | "saveAs"): Promise<void> {
  const state = useLorebookStore.getState();
  const slot = state.lorebooks.find((l) => l.id === state.activeId);
  if (!slot) return;

  let path = slot.currentFilePath;
  if (mode === "saveAs" || !path) {
    const chosen = await save({
      filters: LOREBOOK_FILTERS,
      defaultPath: path ?? (slot.book.name ? `${slot.book.name}.json` : "lorebook.json"),
    });
    if (!chosen) return;
    path = chosen;
  }

  await backupExistingFile(path);
  await writeBinary(path, new TextEncoder().encode(JSON.stringify(toWorldInfo(slot.book), null, 2)));
  state.markSaved(slot.id, path);
}

/** Appends AI-proposed entries to an existing lorebook (creating one if the card doesn't have one
 * yet), leaving all existing entries and other lorebook fields untouched. Mirrors
 * `LorebookTab.tsx`'s `blankEntry()` convention for the fields the AI doesn't provide. */
export function mergeLorebookEntries(book: Lorebook | undefined, entries: AiLorebookEntryDraft[]): Lorebook {
  const newEntries: LorebookEntry[] = entries.map((entry) => ({
    keys: entry.keys,
    content: entry.content,
    comment: entry.comment,
    extensions: {},
    enabled: true,
    insertion_order: 0,
  }));
  return { ...(book ?? { entries: [], extensions: {} }), entries: [...(book?.entries ?? []), ...newEntries] };
}
