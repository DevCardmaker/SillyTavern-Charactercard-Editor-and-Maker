import { mergeLorebook } from "./mergeLorebook";
import type { NormalizedCard } from "./normalize";

/** Merging several character cards into one group card, where a single {{char}} portrays them all.
 * The per-person text is copied, never rewritten by default — nothing gets lost; shortening it to
 * fit the context is a separate, optional step (condense, section by section). */

/** In a single card, {{char}} means that character; in the group card it would mean the whole
 * group — so each person's own text names them instead. */
export function replaceCharMacro(text: string, name: string): string {
  return text.replace(/\{\{char\}\}/gi, name);
}

export interface MergeSection {
  name: string;
  description: string;
  personality: string;
}

export function mergeSections(cards: NormalizedCard[]): MergeSection[] {
  return cards.map((c) => ({
    name: c.name.trim() || "Unnamed",
    description: replaceCharMacro(c.description.trim(), c.name.trim()),
    personality: replaceCharMacro(c.personality.trim(), c.name.trim()),
  }));
}

/** "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function mergeIntro(names: string[]): string {
  return `{{char}} is not one person but portrays several characters: ${joinNames(names)}. Each of them has their own personality, voice and body; write each one true to their own section below.`;
}

/** Description: the intro plus one headed section per person; personality: one labelled
 * paragraph per person who has one (most cards leave it empty and keep everything in the
 * description). */
export function assembleMerged(sections: MergeSection[]): { description: string; personality: string } {
  const description = [mergeIntro(sections.map((s) => s.name)), ...sections.map((s) => `## ${s.name}\n${s.description}`)].join(
    "\n\n",
  );
  const personality = sections
    .filter((s) => s.personality)
    .map((s) => `${s.name}: ${s.personality}`)
    .join("\n\n");
  return { description, personality };
}

/** All the cards' embedded lorebooks in one, exact duplicates skipped; undefined if none has one. */
export function mergeCardLorebooks(cards: NormalizedCard[]): NormalizedCard["character_book"] {
  const books = cards.map((c) => c.character_book).filter((b): b is NonNullable<typeof b> => !!b && b.entries.length > 0);
  if (books.length === 0) return undefined;
  let merged = structuredClone(books[0]);
  for (const book of books.slice(1)) merged = mergeLorebook(merged, book).book;
  return merged;
}
