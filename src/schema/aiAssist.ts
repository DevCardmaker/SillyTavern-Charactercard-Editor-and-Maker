import { z } from "zod";
import { cardV3DataSchema } from "./cardV3";
import type { NormalizedCard } from "./normalize";

/** Fields the AI assistant is allowed to touch. `character_book` is deliberately excluded —
 * structurally too different (nested entries, not a flat text/array value) for this feature. */
export const AI_FIELD_KEYS = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "alternate_greetings",
  "tags",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
] as const;

export type AiFieldKey = (typeof AI_FIELD_KEYS)[number];

const AI_FIELD_LABELS: Record<AiFieldKey, string> = {
  name: "Name",
  description: "Description",
  personality: "Personality",
  scenario: "Scenario",
  first_mes: "First message",
  mes_example: "Example dialogue",
  alternate_greetings: "Alternate greetings",
  tags: "Tags",
  creator_notes: "Creator notes",
  system_prompt: "System prompt",
  post_history_instructions: "Post-History Instructions",
};

export function aiFieldLabel(key: AiFieldKey): string {
  return AI_FIELD_LABELS[key];
}

/** Builds a Zod schema for just the selected fields, reusing `cardV3DataSchema`'s real field
 * types/defaults instead of redeclaring them (avoids drift if the card schema changes). */
export function aiFieldsSchema(selected: readonly AiFieldKey[]) {
  const mask = Object.fromEntries(selected.map((key) => [key, true])) as Record<AiFieldKey, true>;
  return cardV3DataSchema.pick(mask);
}

/** Converts the field-subset schema to a plain JSON Schema for the `response_format.json_schema`
 * request field. `additionalProperties` is forced to `false` — `cardV3DataSchema`'s `.passthrough()`
 * would otherwise leak through as `additionalProperties: {}`, which some backends' strict-mode
 * schema validation rejects, and we don't want the model inventing extra top-level keys anyway. */
export function aiFieldsToJsonSchema(selected: readonly AiFieldKey[]): Record<string, unknown> {
  const schema = z.toJSONSchema(aiFieldsSchema(selected)) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type AiFieldPatch = Partial<Pick<NormalizedCard, AiFieldKey>>;

export type ParseAiPatchResult =
  | { success: true; data: AiFieldPatch }
  | { success: false; error: string };

/** Validates a raw LLM JSON reply against the selected fields' schema. */
export function parseAiPatch(selected: readonly AiFieldKey[], raw: unknown): ParseAiPatchResult {
  const result = aiFieldsSchema(selected).safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data as AiFieldPatch };
}
