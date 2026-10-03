import type { Lorebook, LorebookEntry } from "./lorebook";
import type { NormalizedCard } from "./normalize";

/** How an open card relates to a standalone lorebook it might share:
 * - `synced`: linked (`extensions.world` = lorebook name) and the embedded copy is identical
 * - `outdated`: linked, but the embedded copy differs (or is missing)
 * - `other`: linked to a different lorebook name
 * - `unlinked`: not linked to any lorebook */
export type ShareStatus = "synced" | "outdated" | "other" | "unlinked";

/** The World Info name a card points at via SillyTavern's `extensions.world`, if any. */
export function linkedWorldName(card: NormalizedCard): string | undefined {
  const world = card.extensions?.world;
  return typeof world === "string" && world.trim() !== "" ? world : undefined;
}

/** Name for a card's lorebook once it becomes a shared one: an existing link wins, then the
 * book's own name, then SillyTavern's default for importing a card's embedded lorebook. */
export function sharedNameForCard(card: NormalizedCard): string {
  return linkedWorldName(card) || card.character_book?.name?.trim() || `${card.name || "Character"}'s Lorebook`;
}

/** JSON with object keys sorted, so two books that differ only in key order (e.g. one freshly
 * parsed from a card, one edited in the workspace) still compare equal. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** `null` and a missing book both count as "no lorebook" — cards can carry either. */
export function sameLorebook(a: Lorebook | null | undefined, b: Lorebook | null | undefined): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

export function shareStatus(card: NormalizedCard, book: Lorebook): ShareStatus {
  const world = linkedWorldName(card);
  if (!world) return "unlinked";
  if (world !== book.name) return "other";
  return sameLorebook(card.character_book, book) ? "synced" : "outdated";
}

/** The card patch that distributes `book` to a card: an embedded copy (so the card stays
 * self-contained for sharing) plus the `extensions.world` link. SillyTavern names the World Info
 * it creates from an embedded lorebook after `character_book.name` and skips the import prompt
 * once a World Info with the linked name exists — so with both names equal, the first imported
 * card creates the shared World Info and every further card just links to it. */
export function sharedBookPatch(card: NormalizedCard, book: Lorebook): Partial<NormalizedCard> {
  return {
    character_book: structuredClone(book),
    extensions: { ...card.extensions, world: book.name },
  };
}

/** Case-insensitive search over everything a user would recognise an entry by. */
export function entryMatches(entry: LorebookEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [entry.comment, entry.name, entry.content, ...entry.keys, ...(entry.secondary_keys ?? [])];
  return haystack.some((text) => text?.toLowerCase().includes(q));
}
