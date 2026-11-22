import { characterNotePatch, getCharacterNote } from "./characterNote";
import type { NormalizedCard } from "./normalize";

/** Find & replace across a card's text — e.g. a name the AI wrote instead of {{char}}/{{user}}, or
 * renaming a character everywhere. */

export interface FindOptions {
  matchCase: boolean;
  /** Only whole words: "Wendy" finds "Wendy" and "Wendy's", not "Wendys". */
  wholeWords: boolean;
}

/** One place in the card that can hold the searched text. */
export interface TextSpot {
  id: string;
  label: string;
  text: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findPattern(find: string, options: FindOptions): RegExp | null {
  if (!find) return null;
  const body = escapeRegex(find);
  // Letters of every language count as word characters (\w alone knows only a–z).
  const source = options.wholeWords ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(source, options.matchCase ? "gu" : "giu");
}

export function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Short pieces of text around the first few matches, for the preview. */
export function matchSnippets(text: string, pattern: RegExp, max = 2, around = 40): { before: string; match: string; after: string }[] {
  const snippets: { before: string; match: string; after: string }[] = [];
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    const start = Math.max(0, at - around);
    const end = Math.min(text.length, at + m[0].length + around);
    snippets.push({
      before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`,
      match: m[0],
      after: `${text.slice(at + m[0].length, end)}${end < text.length ? "…" : ""}`,
    });
    if (snippets.length >= max) break;
  }
  return snippets;
}

/** Every text place of a card, lorebook optionally. Ids say where to write back. */
export function cardTextSpots(card: NormalizedCard, withLorebook: boolean): TextSpot[] {
  const spots: TextSpot[] = [
    { id: "description", label: "Description", text: card.description },
    { id: "personality", label: "Personality", text: card.personality },
    { id: "scenario", label: "Scenario", text: card.scenario },
    { id: "first_mes", label: "First message", text: card.first_mes },
    { id: "mes_example", label: "Example dialogue", text: card.mes_example },
    { id: "system_prompt", label: "System prompt", text: card.system_prompt },
    { id: "post_history_instructions", label: "Post-History Instructions", text: card.post_history_instructions },
    { id: "creator_notes", label: "Creator notes", text: card.creator_notes },
    { id: "note", label: "Character's note", text: getCharacterNote(card).prompt },
  ];
  card.alternate_greetings.forEach((g, i) => spots.push({ id: `alt:${i}`, label: `Alternate greeting ${i + 1}`, text: g }));
  (card.group_only_greetings ?? []).forEach((g, i) => spots.push({ id: `group:${i}`, label: `Group greeting ${i + 1}`, text: g }));
  if (withLorebook) {
    (card.character_book?.entries ?? []).forEach((e, i) => {
      const name = e.comment?.trim() || e.keys[0] || `entry ${i + 1}`;
      spots.push({ id: `lore:${i}:content`, label: `Lorebook “${name}”`, text: e.content });
      spots.push({ id: `lore:${i}:keys`, label: `Lorebook “${name}” — keys`, text: e.keys.join(", ") });
    });
  }
  return spots;
}

/** The card with the text replaced in the chosen places. Keys of lorebook entries are replaced one
 * by one, so a key list stays a list. */
export function replaceInCard(
  card: NormalizedCard,
  find: string,
  replacement: string,
  options: FindOptions,
  spotIds: ReadonlySet<string>,
): { patch: Partial<NormalizedCard>; count: number } {
  const pattern = findPattern(find, options);
  if (!pattern) return { patch: {}, count: 0 };
  let count = 0;
  // A function, so "$1" or "$&" in the replacement is written as it is.
  const swap = (text: string) => text.replace(pattern, () => {
    count++;
    return replacement;
  });
  const patch: Partial<NormalizedCard> = {};
  for (const key of ["description", "personality", "scenario", "first_mes", "mes_example", "system_prompt", "post_history_instructions", "creator_notes"] as const) {
    if (spotIds.has(key)) patch[key] = swap(card[key]);
  }
  if (spotIds.has("note")) {
    Object.assign(patch, characterNotePatch(card, { prompt: swap(getCharacterNote(card).prompt) }));
  }
  if ([...spotIds].some((id) => id.startsWith("alt:"))) {
    patch.alternate_greetings = card.alternate_greetings.map((g, i) => (spotIds.has(`alt:${i}`) ? swap(g) : g));
  }
  if ([...spotIds].some((id) => id.startsWith("group:"))) {
    patch.group_only_greetings = (card.group_only_greetings ?? []).map((g, i) => (spotIds.has(`group:${i}`) ? swap(g) : g));
  }
  if (card.character_book && [...spotIds].some((id) => id.startsWith("lore:"))) {
    patch.character_book = {
      ...card.character_book,
      entries: card.character_book.entries.map((e, i) => ({
        ...e,
        content: spotIds.has(`lore:${i}:content`) ? swap(e.content) : e.content,
        keys: spotIds.has(`lore:${i}:keys`) ? e.keys.map(swap) : e.keys,
      })),
    };
  }
  return { patch, count };
}
