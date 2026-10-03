import type { Lorebook, LorebookEntry } from "./lorebook";

export interface MergeResult {
  book: Lorebook;
  added: number;
  /** Entries left out because the target already has the same entry (same keys and content). */
  skipped: number;
}

function fingerprint(entry: LorebookEntry): string {
  const keys = entry.keys.map((k) => k.trim().toLowerCase()).filter(Boolean).sort();
  return `${keys.join("\u0001")}\u0002${entry.content.trim()}`;
}

/** Appends `source`'s entries to `target`, keeping everything else about `target` (name,
 * description, scan settings). Exact duplicates — same keys (any order, any case) and same
 * content — are skipped, so merging the same lorebook twice changes nothing. Entries that merely
 * share a label or a key are kept; the key warning in the editor points those out. Appended entries
 * drop their old `id`: ids are assigned fresh on save. */
export function mergeLorebook(target: Lorebook, source: Lorebook): MergeResult {
  const seen = new Set(target.entries.map(fingerprint));
  const toAdd: LorebookEntry[] = [];
  let skipped = 0;
  for (const entry of source.entries) {
    const fp = fingerprint(entry);
    if (seen.has(fp)) {
      skipped++;
      continue;
    }
    seen.add(fp);
    const { id: _id, ...rest } = entry;
    toAdd.push(rest);
  }
  return { book: { ...target, entries: [...target.entries, ...toAdd] }, added: toAdd.length, skipped };
}
