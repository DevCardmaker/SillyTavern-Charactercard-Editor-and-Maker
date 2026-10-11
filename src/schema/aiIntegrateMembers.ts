import { z } from "zod";
import { type ConsistencyFixField, locateSnippet, type ResolvedFixChange } from "./aiConsistencyFix";
import type { NormalizedCard } from "./normalize";

/** Fields new characters may be added to — first_mes is left out, a mention appended to an opening
 * message reads oddly. */
export const INTEGRATE_FIELDS = ["description", "personality", "scenario"] as const satisfies readonly ConsistencyFixField[];

/** Additions only, never find/replace: working new characters into existing cards only ever needs
 * new sentences, and this way the model can't drop or reword anything that was there. `after` is
 * just a position hint — if the quote isn't found, the text goes at the end of the field. */
const aiIntegrateSchema = z.object({
  explanation: z.string(),
  additions: z.array(
    z.object({
      character: z.string(),
      field: z.enum(INTEGRATE_FIELDS),
      after: z.string(),
      add: z.string(),
    }),
  ),
});

export type AiIntegration = z.infer<typeof aiIntegrateSchema>;
export type AiIntegrationAddition = AiIntegration["additions"][number];

export function aiIntegrateToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiIntegrateSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiIntegrationResult = { success: true; data: AiIntegration } | { success: false; error: string };

export function parseAiIntegration(raw: unknown): ParseAiIntegrationResult {
  const result = aiIntegrateSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

/** The last sentence of `text` (or all of it if it has no sentence break). */
export function lastSentence(text: string): string {
  const parts = text.trim().split(/(?<=[.!?…"*)])\s+/);
  return parts[parts.length - 1] ?? "";
}

/** Turns additions into find/replace changes the review list and `applySnippet` already handle:
 * `find` is the anchor sentence as it really is in the card (or the field's last sentence, when the
 * model's quote doesn't match), `replace` is that sentence plus the new text. */
export function additionsToChanges(
  additions: AiIntegrationAddition[],
  characters: { id: string; card: NormalizedCard }[],
): ResolvedFixChange[] {
  return additions
    .filter((a) => a.add.trim())
    .map((a) => {
      const slot = characters.find((c) => c.card.name.trim().toLowerCase() === a.character.trim().toLowerCase());
      const base = { character: a.character, field: a.field, find: "", replace: a.add.trim() };
      if (!slot) return { ...base, slotId: null, problem: `No reference card is called “${a.character}”.` };
      const text = slot.card[a.field];
      if (!text.trim()) return { ...base, slotId: slot.id, problem: "This field is empty — add the text by hand." };
      const at = a.after.trim() ? locateSnippet(text, a.after) : null;
      const anchor = at ? text.slice(at.start, at.end) : lastSentence(text);
      return { ...base, slotId: slot.id, find: anchor, replace: `${anchor} ${a.add.trim()}` };
    });
}
