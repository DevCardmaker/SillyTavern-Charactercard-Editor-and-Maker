import { z } from "zod";
import { aiGroupMemberSchema } from "./aiGroupGenerate";
import type { NormalizedCard } from "./normalize";

/** Splitting a group card runs in passes, because a local model asked to rewrite every character
 * at once summarises heavily: first it only lists the people (from the card and its lorebook), the
 * user picks who to extract, then each person gets a request of their own. */

export const MAX_SPLIT_PEOPLE = 20;

/** `source` tells the user where a person comes from — people only found in the lorebook are
 * usually side characters, so they aren't preselected. */
const aiSplitPeopleSchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        source: z.enum(["card", "lorebook"]),
      }),
    )
    .max(MAX_SPLIT_PEOPLE),
});

export type AiSplitPerson = z.infer<typeof aiSplitPeopleSchema>["people"][number];

export function aiSplitPeopleToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiSplitPeopleSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

/** Drops blank names and duplicates (the model sometimes lists a person twice, once per source). */
export function parseAiSplitPeople(raw: unknown): ParseResult<AiSplitPerson[]> {
  const result = aiSplitPeopleSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  const seen = new Set<string>();
  const people = result.data.people.filter((p) => {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key) || key === "{{user}}") return false;
    seen.add(key);
    return true;
  });
  return { success: true, data: people };
}

export type AiSplitMember = z.infer<typeof aiGroupMemberSchema>;

export function aiSplitMemberToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiGroupMemberSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiSplitMember(raw: unknown): ParseResult<AiSplitMember> {
  const result = aiGroupMemberSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

export interface SplitLorebookEntry {
  comment: string;
  content: string;
}

/** Words in a person's label that say nothing about *which* person it is ("Uncle Bernd", "Dr. Keller",
 * "the mother") — matching on them would pull in unrelated entries. */
const NAME_FILLER = new Set(["the", "uncle", "aunt", "auntie", "mr", "mrs", "ms", "miss", "dr", "sir", "lady", "lord", "frau", "herr", "onkel", "tante"]);

function nameWords(person: string): string[] {
  return person
    .toLowerCase()
    .split(/[\s.,'’()-]+/)
    .filter((w) => w.length >= 3 && !NAME_FILLER.has(w));
}

/** The card's lorebook entries, compact (label + text only). With `person`, only entries that
 * mention them — any distinctive word of their name, in keys, label or text — so a person's
 * request doesn't carry the whole book. */
export function lorebookEntriesForSplit(card: NormalizedCard, person?: string): SplitLorebookEntry[] {
  const entries = card.character_book?.entries ?? [];
  const words = person ? nameWords(person) : [];
  return entries
    .filter((e) => e.content.trim())
    .filter((e) => {
      if (!person) return true;
      const haystack = [...e.keys, e.comment ?? "", e.content].join("\n").toLowerCase();
      return words.some((w) => haystack.includes(w));
    })
    .map((e) => ({ comment: e.comment ?? "", content: e.content }));
}

/** A rough plausibility check per extracted card — the code can't tell *what* is missing or made up,
 * but it can spot a card that's far shorter than this person's likely share of the group card, or
 * longer than the whole group card (repeated or invented text). Not used for people found only in
 * the lorebook, whose share of the card text is naturally small. */
export function splitMemberWarning(
  group: NormalizedCard,
  member: AiSplitMember,
  cardPeopleCount: number,
): "short" | "long" | null {
  const groupLength = group.description.length + group.personality.length;
  const length = member.description.length + member.personality.length;
  if (groupLength < 400) return null;
  if (length > groupLength * 1.3) return "long";
  if (length < (groupLength / Math.max(1, cardPeopleCount)) * 0.35) return "short";
  return null;
}
