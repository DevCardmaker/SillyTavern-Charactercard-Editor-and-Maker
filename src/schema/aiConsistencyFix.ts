import { z } from "zod";
import type { NormalizedCard } from "./normalize";

/** The card fields a consistency fix may edit — the ones the check looks at, minus `name`
 * (renaming a character would break matching, tabs and every other card that mentions them). */
export const CONSISTENCY_FIX_FIELDS = ["description", "personality", "scenario", "first_mes"] as const;
export type ConsistencyFixField = (typeof CONSISTENCY_FIX_FIELDS)[number];

export const CONSISTENCY_FIX_FIELD_LABELS: Record<ConsistencyFixField, string> = {
  description: "Description",
  personality: "Personality",
  scenario: "Scenario",
  first_mes: "First message",
};

/** A fresh, minimal schema — same `.passthrough()`-leak reason as aiConsistencyCheck.ts. A fix is a
 * list of small find/replace edits, not rewritten fields: a local model rewriting a whole field
 * tends to shorten it and drop details that had nothing to do with the contradiction. */
const aiConsistencyFixSchema = z.object({
  explanation: z.string(),
  changes: z.array(
    z.object({
      character: z.string(),
      field: z.enum(CONSISTENCY_FIX_FIELDS),
      find: z.string(),
      replace: z.string(),
    }),
  ),
});

export type AiConsistencyFix = z.infer<typeof aiConsistencyFixSchema>;
export type AiConsistencyFixChange = AiConsistencyFix["changes"][number];

export function aiConsistencyFixToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiConsistencyFixSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiConsistencyFixResult = { success: true; data: AiConsistencyFix } | { success: false; error: string };

export function parseAiConsistencyFix(raw: unknown): ParseAiConsistencyFixResult {
  const result = aiConsistencyFixSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where `find` sits in `text`: verbatim first, else with any run of whitespace matching any other
 * (models like to turn line breaks into spaces when quoting). Null if it isn't there. */
export function locateSnippet(text: string, find: string): { start: number; end: number } | null {
  const needle = find.trim();
  if (!needle) return null;
  const exact = text.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };
  const loose = new RegExp(needle.split(/\s+/).map(escapeRegex).join("\\s+"));
  const match = loose.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/** `text` with `find` replaced, or null if `find` isn't in it (any more). */
export function applySnippet(text: string, find: string, replace: string): string | null {
  const at = locateSnippet(text, find);
  if (!at) return null;
  return text.slice(0, at.start) + replace.trim() + text.slice(at.end);
}

export interface ResolvedFixChange extends AiConsistencyFixChange {
  /** The open tab this change belongs to, or null if the name matches none. */
  slotId: string | null;
  /** Why this change can't be applied (unknown character, quoted text not in the card). */
  problem?: string;
}

/** Matches each proposed change to an open character and checks that the quoted text really is in
 * that field — the model sometimes paraphrases instead of quoting, and such a change can't be
 * applied safely. Changes that would do nothing are dropped. */
export function resolveFixChanges(
  changes: AiConsistencyFixChange[],
  characters: { id: string; card: NormalizedCard }[],
): ResolvedFixChange[] {
  return changes
    .filter((c) => c.find.trim() !== c.replace.trim())
    .map((change) => {
      const slot = characters.find((c) => c.card.name.trim().toLowerCase() === change.character.trim().toLowerCase());
      if (!slot) return { ...change, slotId: null, problem: `No open character is called “${change.character}”.` };
      if (!locateSnippet(slot.card[change.field], change.find)) {
        return { ...change, slotId: slot.id, problem: "The AI quoted text that isn't in this field — can't be applied." };
      }
      return { ...change, slotId: slot.id };
    });
}
