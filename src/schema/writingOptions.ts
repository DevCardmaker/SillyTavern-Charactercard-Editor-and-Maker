import { aiFieldLabel, type AiFieldKey } from "./aiAssist";
import { promptText } from "./promptTexts";

/** Optional guidance for the AI Assistant: how long fields should be and which point of view
 * opening messages use. With nothing picked, none of it reaches the prompt. */
export const FIELD_LENGTHS = ["short", "medium", "long"] as const;
export type FieldLength = (typeof FIELD_LENGTHS)[number];

export const OPENING_POVS = ["first", "second", "third"] as const;
export type OpeningPov = (typeof OPENING_POVS)[number];

export interface LengthChoices {
  /** "" leaves the length to the instruction. */
  all: FieldLength | "";
  /** Fields that differ from `all`. */
  fields: Partial<Record<AiFieldKey, FieldLength>>;
}

/** Rough amounts: smaller models can't count words exactly, so these only set the size. */
const AMOUNTS: Partial<Record<AiFieldKey, Record<FieldLength, string>>> = {
  description: { short: "120 words", medium: "250 words", long: "450 words" },
  personality: { short: "80 words", medium: "160 words", long: "300 words" },
  scenario: { short: "60 words", medium: "120 words", long: "250 words" },
  first_mes: { short: "120 words", medium: "250 words", long: "450 words" },
  alternate_greetings: { short: "120 words each", medium: "250 words each", long: "450 words each" },
  mes_example: { short: "2 exchanges", medium: "3 exchanges", long: "5 exchanges" },
  creator_notes: { short: "50 words", medium: "100 words", long: "200 words" },
};

/** Selected fields a length can apply to; a name or tags have no length to speak of. */
export function fieldsWithLength(selected: readonly AiFieldKey[]): AiFieldKey[] {
  return selected.filter((key) => key in AMOUNTS);
}

export const usesOpeningPov = (selected: readonly AiFieldKey[]): boolean =>
  selected.includes("first_mes") || selected.includes("alternate_greetings");

const POV_PROMPTS = { first: "pov_first", second: "pov_second", third: "pov_third" } as const;

/** Lines to add to the system prompt, only for fields the user actually selected. */
export function buildWritingNotes(
  selected: readonly AiFieldKey[],
  lengths: LengthChoices,
  pov: OpeningPov | "",
): string[] {
  const notes: string[] = [];
  for (const key of fieldsWithLength(selected)) {
    const length = lengths.fields[key] ?? lengths.all;
    const amount = length ? AMOUNTS[key]?.[length] : undefined;
    if (amount) notes.push(promptText("field_length", { field: aiFieldLabel(key), amount }));
  }
  if (pov && usesOpeningPov(selected)) notes.push(promptText(POV_PROMPTS[pov]));
  return notes;
}
