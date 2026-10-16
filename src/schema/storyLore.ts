import { z } from "zod";
import { cleanAiKeys } from "./aiLorebookAssist";
import type { Lorebook } from "./lorebook";
import { upsertMemberEntries } from "./memberEntries";
import {
  isLabel,
  LEADING_ARTICLE,
  labelPhrase,
  mergeNameGroups,
  nameKey,
  paragraphsMentioning,
  type ParseResult,
} from "./storyToCards";

/** A lorebook from a story — the world around the characters, in the same kind of passes as the
 * cards (see storyToCards.ts):
 *  1. for each part of the story the model lists the places, groups and terms in it; the code
 *     checks the names against the text, merges the lists and counts the paragraphs;
 *  2. the user picks what gets an entry — also side characters who get no card of their own;
 *  3. for each pick the code collects the paragraphs that mention it, the model writes a short
 *     entry from them. Keys are made by the code, from the names the story actually uses. */

export type LoreKind = "place" | "group" | "term" | "person";

export const LORE_KIND_LABELS: Record<LoreKind, string> = {
  place: "place",
  group: "group",
  term: "term",
  person: "side character",
};

// ── Finding pass ────────────────────────────────────────────────────────────────────────────────

const aiStoryLoreSchema = z.object({
  things: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.enum(["place", "group", "term"]),
        also_called: z.array(z.string().max(60)).max(6),
        about: z.string().max(160),
      }),
    )
    .max(30),
});

export type AiStoryLoreThing = z.infer<typeof aiStoryLoreSchema>["things"][number];

export function aiStoryLoreToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiStoryLoreSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiStoryLore(raw: unknown): ParseResult<AiStoryLoreThing[]> {
  const result = aiStoryLoreSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  // "Briony Lodge (Irene's villa)", "John, the coachman": the explanation isn't part of the name.
  const strip = (n: string) => n.replace(/\s*\([^)]*\)\s*/g, " ").split(/,\s/)[0].trim();
  return {
    success: true,
    data: result.data.things
      .map((t) => ({
        ...t,
        name: strip(t.name),
        also_called: t.also_called.map(strip).filter(Boolean),
        about: t.about.trim(),
      }))
      .filter((t) => t.name && !t.name.includes("{{")),
  };
}

/** One place, group or term across the whole story. */
/** Whether the user should decide on it without a preselection: an everyday word in lowercase
 * ("letter", "scandal") rather than a name — the model lists those though told not to. */
export function isCommonWord(item: { name: string }): boolean {
  return isLabel(item.name);
}

export interface StoryLoreItem {
  name: string;
  aliases: string[];
  kind: LoreKind;
  /** What the parts said it is, most informative first. */
  about: string[];
  mentions: number;
}

/** Whether a listed thing is really one of the people (the model lists "Irene Adler" or "the
 * Nonconformist clergyman" now and then, though told not to): the same name, or a description
 * that ends in a person's description ("Nonconformist clergyman" — "the clergyman"). */
function isPerson(thing: AiStoryLoreThing, people: { name: string; aliases: string[] }[]): boolean {
  const names = [thing.name, ...thing.also_called].map(nameKey);
  return people.some((p) =>
    [p.name, ...p.aliases].some((n) => {
      const key = nameKey(n);
      return names.some((t) => t === key || (isLabel(n) && t.endsWith(` ${key}`)));
    }),
  );
}

/** Merges the lists of all parts (same rules as for people, see `mergeNameGroups`). The kind is
 * the one most parts gave. Things that are really people are dropped first — before merging, or
 * "Bohemia" would be merged into "King of Bohemia" and go with him. */
export function mergeStoryLore(
  lists: AiStoryLoreThing[][],
  paragraphs: string[],
  people: { name: string; aliases: string[] }[] = [],
): StoryLoreItem[] {
  // An alias that some part lists as a thing of its own is a different thing: the model gave
  // "Egria" the alias "Bohemia", the country it lies in.
  const mainNames = new Set(lists.flat().map((t) => nameKey(t.name)));
  const found = lists
    .flat()
    .filter((t) => !isPerson(t, people))
    .map((t) => ({ ...t, also_called: t.also_called.filter((a) => !mainNames.has(nameKey(a)) || nameKey(a) === nameKey(t.name)) }));
  const groups = mergeNameGroups(found.map((t) => ({ names: [t.name, ...t.also_called], roles: t.about ? [t.about] : [] })));
  const items: StoryLoreItem[] = groups
    .map((g) => {
      const keys = new Set(g.names.map(nameKey));
      const votes = new Map<LoreKind, number>();
      for (const t of found) if (keys.has(nameKey(t.name))) votes.set(t.kind, (votes.get(t.kind) ?? 0) + 1);
      const kind = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "term";
      return {
        name: g.name,
        aliases: g.names.filter((n) => n !== g.name),
        kind,
        about: [...g.roles].sort((a, b) => b.length - a.length),
        mentions: 0,
      };
    });
  for (const item of items) {
    item.mentions = paragraphsMentioning(paragraphs, item, items.filter((o) => o !== item)).length;
  }
  return items.sort((a, b) => b.mentions - a.mentions);
}

// ── Entry pass ──────────────────────────────────────────────────────────────────────────────────

/** Excerpts for one entry: the paragraphs that mention it, within `max` tokens. If there are too
 * many, the first and last ones go in first, then alternately from both ends inward — the entry
 * needs what it is (usually where it's introduced) and how it stands at the end. Returned in
 * story order; paragraphs that weren't next to each other in the story stay separate excerpts. */
export function loreExcerpts(paragraphs: string[], indices: number[], count: (t: string) => number, max = 2000): string[] {
  const order: number[] = [];
  for (let lo = 0, hi = indices.length - 1; lo <= hi; lo++, hi--) {
    order.push(indices[lo]);
    if (hi !== lo) order.push(indices[hi]);
  }
  const chosen: number[] = [];
  let size = 0;
  for (const i of order) {
    const n = count(paragraphs[i]);
    if (chosen.length > 0 && size + n > max) continue;
    chosen.push(i);
    size += n;
  }
  chosen.sort((a, b) => a - b);
  const excerpts: string[] = [];
  chosen.forEach((i, k) => {
    if (k > 0 && chosen[k - 1] === i - 1) excerpts[excerpts.length - 1] += `\n\n${paragraphs[i]}`;
    else excerpts.push(paragraphs[i]);
  });
  return excerpts;
}

/** About five short sentences — the limit is in the schema, since the prompt alone didn't hold
 * (live test: seven sentences for Watson, still six at 700 characters). */
const aiStoryLoreEntrySchema = z.object({ content: z.string().max(520) });

export function aiStoryLoreEntryToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiStoryLoreEntrySchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiStoryLoreEntry(raw: unknown): ParseResult<string> {
  const result = aiStoryLoreEntrySchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  const content = toSentenceEnd(result.data.content.trim());
  return content ? { success: true, data: content } : { success: false, error: "The entry came back empty." };
}

/** Cuts a text the length limit stopped mid-sentence back to its last full sentence. */
export function toSentenceEnd(text: string): string {
  if (/[.!?…"”»)]$/.test(text)) return text;
  const end = Math.max(...[". ", "! ", "? ", "… "].map((p) => text.lastIndexOf(p)));
  return end > 0 ? text.slice(0, end + 1) : text;
}

/** Relationship words: as an alias ("the mother", "Gregors Schwester") they'd fire on every
 * mention of anyone's mother. Only the *main* name may be one — for a side character the story
 * names only so ("die Mutter"), that's how the chat will refer to them too. */
const RELATIONSHIP_WORD =
  /\b(mom|mommy|mum|mother|dad|daddy|father|sister|brother|aunt|uncle|cousin|grandma|grandmother|grandpa|grandfather|wife|husband|son|daughter|mama|mutter|papa|vater|schwester|bruder|tante|onkel|oma|opa|sohn|tochter)\b/i;

/** The keys of an entry, from the names the story uses (each was checked against the text in the
 * finding pass): a leading article goes ("the Diogenes Club" → "Diogenes Club"); descriptions
 * ("the old house", lowercase after the article) and relationship words in aliases go too, since
 * they'd fire everywhere. The main name always stays, as a phrase if it's a description itself. */
export function loreKeys(item: { name: string; aliases: string[] }): string[] {
  const main = isLabel(item.name) ? labelPhrase(item.name) : item.name.trim().replace(LEADING_ARTICLE, "");
  const aliases = item.aliases
    .filter((a) => !isLabel(a) && !RELATIONSHIP_WORD.test(a))
    .map((a) => a.trim().replace(LEADING_ARTICLE, ""))
    .filter((a) => a.length >= 3);
  return cleanAiKeys([main, ...aliases]);
}

export interface StoryLoreEntry {
  name: string;
  keys: string[];
  content: string;
}

/** The story's lorebook: one entry per pick, labelled with its name. */
export function buildStoryLorebook(name: string, entries: StoryLoreEntry[]): Lorebook {
  const book: Lorebook = { name: name.trim() || "Story Lorebook", description: "", entries: [], extensions: {} };
  return upsertMemberEntries(
    book,
    entries.filter((e) => e.content.trim() && e.keys.length > 0).map((e) => ({ name: e.name, keys: e.keys, content: e.content.trim() })),
  );
}

/** A name for the lorebook: the story file's name, else the main character's. */
export function defaultLorebookName(fileName: string | null, firstPerson: string | null): string {
  const base = fileName?.replace(/\.[^.]+$/, "").trim();
  if (base) return `${base} Lorebook`;
  if (firstPerson) return `${firstPerson}'s World`;
  return "Story Lorebook";
}
