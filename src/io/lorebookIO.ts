import { open, save } from "@tauri-apps/plugin-dialog";
import type { AiLorebookEntryDraft } from "../schema/aiLorebookAssist";
import { lorebookSchema, type Lorebook, type LorebookEntry } from "../schema/lorebook";
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
 * `null` if the dialog was cancelled. Throws (via the schema) if the file isn't a valid
 * lorebook — same "let it throw, caller shows the error banner" pattern as card loading. */
export async function importLorebook(): Promise<Lorebook | null> {
  const selected = await open({ multiple: false, filters: LOREBOOK_FILTERS });
  if (!selected || Array.isArray(selected)) return null;
  const bytes = await readBinary(selected);
  const json = JSON.parse(new TextDecoder().decode(bytes));
  return lorebookSchema.parse(json);
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
