import type { BudgetField } from "./contextBudget";

export interface CondensePiece {
  text: string;
  /** False for line breaks and for pieces too short to be worth an AI call. */
  condense: boolean;
}

/** Below this, a section is left as it is — little to gain, and short texts are the easiest to
 * over-condense. */
export const MIN_SECTION_TOKENS = 60;

/** Splits a field into sections to condense one by one. A local model condensing a whole long
 * description at once loses many small facts (tested with Cydonia: 1011 → 308 tokens, 30+ facts
 * gone); section by section it keeps them (1011 → 666, nearly all facts kept). Line breaks are kept
 * as their own pieces, so joining all pieces back together restores the original layout. Example
 * dialogue and first message stay whole — splitting would tear dialogue turns apart. */
export function splitForCondense(text: string, field: BudgetField, count: (text: string) => number): CondensePiece[] {
  if (field === "mes_example" || field === "first_mes") return [{ text, condense: count(text) >= MIN_SECTION_TOKENS }];
  return text
    .split(/(\n+)/)
    .filter((piece) => piece !== "")
    .map((piece) => ({ text: piece, condense: !/^\n+$/.test(piece) && count(piece) >= MIN_SECTION_TOKENS }));
}

/** Detects an AI reply that broke off mid-text — typically when the model writes a straight
 * double quote (5'11") and the JSON string ends right there. Such a result would silently delete
 * the rest of the section, so the caller keeps the original section instead. */
export function looksCutOff(original: string, result: string): boolean {
  const trimmed = result.trim();
  if (trimmed === "") return true;
  const originalEnd = original.trim().slice(-1);
  const endsCleanly = /[.!?…)\]}>*”’"'~]$/.test(trimmed) || trimmed.slice(-1) === originalEnd;
  return !endsCleanly || trimmed.length < original.trim().length * 0.25;
}
