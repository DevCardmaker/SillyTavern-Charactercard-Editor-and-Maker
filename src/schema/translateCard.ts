import { z } from "zod";
import { characterNotePatch, getCharacterNote } from "./characterNote";
import type { NormalizedCard } from "./normalize";

/** Translating a card into any language, part by part: long fields are cut into chunks at line
 * breaks (a local model translating a whole long card at once shortens it, like condensing does),
 * each chunk is one request, and the code checks every result before it's used. */

/** About this many tokens per request — big enough that a line-per-line W++ card doesn't turn
 * into a hundred requests, small enough that nothing gets summarised away. */
export const CHUNK_TOKENS = 350;

/** Where a translated piece goes back into the card. */
export type TranslateTarget =
  | { kind: "field"; field: TranslatableField }
  | { kind: "greeting"; index: number }
  | { kind: "note" };

export const TRANSLATABLE_FIELDS = [
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
] as const;
export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

const FIELD_LABELS: Record<TranslatableField, string> = {
  description: "Description",
  personality: "Personality",
  scenario: "Scenario",
  first_mes: "First message",
  mes_example: "Example dialogue",
  system_prompt: "System prompt",
  post_history_instructions: "Post-history instructions",
  creator_notes: "Creator notes",
};

export interface TranslateText {
  target: TranslateTarget;
  label: string;
  /** The field's text cut into pieces: chunks to translate, and the line breaks between them,
   * which are kept as they are — joining all pieces restores the layout. */
  pieces: { text: string; translate: boolean }[];
}

/** Cuts `text` at line breaks into chunks of about `maxTokens`. A single longer line stays one
 * chunk. Pieces without any letters (blank lines, separators like "***") aren't sent at all. */
export function chunkForTranslation(text: string, count: (text: string) => number, maxTokens = CHUNK_TOKENS) {
  const pieces: { text: string; translate: boolean }[] = [];
  let current = "";
  const flush = () => {
    if (current) pieces.push({ text: current, translate: /\p{L}/u.test(current) });
    current = "";
  };
  for (const part of text.split(/(\n+)/)) {
    if (part === "") continue;
    if (/^\n+$/.test(part)) {
      // A paragraph break ends a chunk only once it's big enough; otherwise it stays inside.
      if (current && count(current) >= maxTokens) {
        flush();
        pieces.push({ text: part, translate: false });
      } else if (current) current += part;
      else pieces.push({ text: part, translate: false });
      continue;
    }
    if (current && count(current + part) > maxTokens) {
      // Cut before this line: move the line break(s) at the end of the chunk out of it.
      const tail = current.match(/\n+$/)?.[0] ?? "";
      current = current.slice(0, current.length - tail.length);
      flush();
      if (tail) pieces.push({ text: tail, translate: false });
    }
    current += part;
  }
  flush();
  return pieces;
}

/** Every text in the card worth translating, in card order. Empty fields are skipped. */
export function collectTranslateTexts(card: NormalizedCard, count: (text: string) => number): TranslateText[] {
  const texts: TranslateText[] = [];
  const add = (target: TranslateTarget, label: string, text: string) => {
    if (text.trim()) texts.push({ target, label, pieces: chunkForTranslation(text, count) });
  };
  for (const field of TRANSLATABLE_FIELDS) add({ kind: "field", field }, FIELD_LABELS[field], card[field]);
  card.alternate_greetings.forEach((g, index) => add({ kind: "greeting", index }, `Alternate greeting ${index + 1}`, g));
  add({ kind: "note" }, "Character's note", getCharacterNote(card).prompt);
  return texts;
}

/** Things a translation must keep exactly: SillyTavern macros, the example-dialogue separator and
 * tags like <backstory> that some cards use as section markers (live test: the model silently
 * dropped one). Counted, not just checked for presence — a dropped {{user}} is a real change. */
export function protectedTokens(text: string): string[] {
  return (text.match(/\{\{[^{}]+\}\}|<\/?[A-Za-z][\w-]*>/g) ?? []).map((t) => t.toLowerCase()).sort();
}

/** Numbers a translation must keep (ages, years, sizes) — language-neutral, and the clearest sign
 * of a made-up text: in a live test the model invented whole new lorebook entries, which kept the
 * length but had none of the original's numbers. */
export function numbersIn(text: string): string[] {
  return [...new Set(text.match(/\d+(?:[.,]\d+)?/g) ?? [])].sort();
}

/** Why a translated chunk can't be used as it is, or null if it looks fine. */
export function translationProblem(original: string, translated: string): string | null {
  const result = translated.trim();
  if (!result) return "came back empty";
  // Returned as it was: every other check passes for an untranslated text, so this needs its own
  // (seen with a Russian first message). A text already in the target language trips it too —
  // then the retry fails the same way and the part keeps its (correct) original, just with a note.
  const plain = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  if (plain(result) === plain(original) && (original.match(/\p{L}/gu)?.length ?? 0) >= 20) {
    return "came back unchanged — not translated";
  }
  if (result.length < original.trim().length * 0.3) return "much shorter than the original — probably cut off";
  const before = protectedTokens(original).join(" ");
  const after = protectedTokens(result).join(" ");
  if (before !== after) return "macros like {{char}}/{{user}} or tags like <START> got lost or changed";
  const missing = numbersIn(original).filter((n) => !result.includes(n) && !result.includes(n.replace(/[.,]/, (c) => (c === "." ? "," : "."))));
  if (missing.length > 0) return `numbers from the original are missing (${missing.slice(0, 3).join(", ")}) — maybe made up`;
  return null;
}

/** Keeps the chunk's own leading/trailing whitespace — the model trims it, the layout needs it. */
export function withOriginalSpacing(original: string, translated: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  return lead + translated.trim() + trail;
}

const aiTranslationSchema = z.object({ translation: z.string() });

export function aiTranslationToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiTranslationSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

/** A lorebook entry's label and keys — translated in a request of their own; the entry's text goes
 * the same way as card text. Sent together as one entry, the model wrote new entries instead. */
const aiKeysTranslationSchema = z.object({ comment: z.string(), keys: z.array(z.string()) });
export type AiKeysTranslation = z.infer<typeof aiKeysTranslationSchema>;
export type AiEntryTranslation = AiKeysTranslation & { content: string };

export function aiKeysTranslationToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiKeysTranslationSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiTranslation(raw: unknown): { success: true; data: string } | { success: false; error: string } {
  const result = aiTranslationSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data.translation } : { success: false, error: result.error.message };
}

export function parseAiKeysTranslation(
  raw: unknown,
): { success: true; data: AiKeysTranslation } | { success: false; error: string } {
  const result = aiKeysTranslationSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error.message };
}

/** Translated keys, cleaned up: blanks and duplicates dropped; if nothing usable came back, the
 * original keys stay (an entry without keys would never trigger). An original key that still
 * appears word for word in the translated entry text is a name (or a word that stays the same) —
 * it's always kept, since the model sometimes swaps a name for a translated noun (live test: the
 * pub "Zum Hirschen" lost its key "Hirschen" to "Gasthaus"). */
export function cleanTranslatedKeys(original: string[], translated: string[], translatedContent = ""): string[] {
  const seen = new Set<string>();
  const content = translatedContent.toLowerCase();
  const names = original.filter((k) => k.trim() && content.includes(k.trim().toLowerCase()));
  const keys = [...names, ...translated]
    .map((k) => k.trim())
    .filter((k) => {
      const lower = k.toLowerCase();
      if (!k || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  return keys.length > 0 ? keys : original;
}

/** The card with all translated texts put back in. `results` holds the joined text per
 * TranslateText (same order as `collectTranslateTexts`); the name stays as it is. */
export function applyTranslations(
  card: NormalizedCard,
  texts: TranslateText[],
  results: string[],
  entries: (AiEntryTranslation | null)[] | null,
): NormalizedCard {
  const next: NormalizedCard = structuredClone(card);
  texts.forEach((t, i) => {
    const value = results[i];
    if (value === undefined) return;
    if (t.target.kind === "field") next[t.target.field] = value;
    else if (t.target.kind === "greeting") next.alternate_greetings[t.target.index] = value;
    else Object.assign(next, characterNotePatch(next, { prompt: value }));
  });
  if (entries && next.character_book) {
    next.character_book.entries = next.character_book.entries.map((entry, i) => {
      const tr = entries[i];
      if (!tr) return entry;
      return {
        ...entry,
        comment: tr.comment.trim() || entry.comment,
        content: tr.content,
        keys: cleanTranslatedKeys(entry.keys, tr.keys, tr.content),
      };
    });
  }
  return next;
}
