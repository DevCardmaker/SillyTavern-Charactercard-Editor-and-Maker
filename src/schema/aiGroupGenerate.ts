import { z } from "zod";

/** A fresh, minimal schema rather than deriving from `cardV3DataSchema` — same reason as
 * aiLorebookAssist.ts/aiConsistencyCheck.ts: `.passthrough()` on the real schema leaks into nested
 * array items as `additionalProperties: {}` via `z.toJSONSchema()`. Field names match
 * `NormalizedCard`'s own field names 1:1 so a member can be applied directly as an `updateCard`
 * patch — deliberately a small, fixed subset (not all of `AI_FIELD_KEYS` from aiAssist.ts) to keep
 * the request/response size sane once multiplied across several members; the rest (example
 * dialogue, tags, system prompt, …) is left to the existing per-card `AiAssistPanel` afterwards. */
const aiGroupMemberSchema = z.object({
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  first_mes: z.string(),
});

export type AiGroupMemberDraft = z.infer<typeof aiGroupMemberSchema>;

function aiGroupSchema(count: number) {
  return z.object({ characters: z.array(aiGroupMemberSchema).length(count) });
}

/** Same "build the schema from a runtime parameter" approach as `aiFieldsSchema` in aiAssist.ts —
 * here the parameter is the exact member count instead of a field selection, constraining the
 * array to precisely `count` items via `.length()`. */
export function aiGroupToJsonSchema(count: number): Record<string, unknown> {
  const schema = z.toJSONSchema(aiGroupSchema(count)) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiGroupResult =
  | { success: true; data: AiGroupMemberDraft[] }
  | { success: false; error: string };

export function parseAiGroup(count: number, raw: unknown): ParseAiGroupResult {
  const result = aiGroupSchema(count).safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.characters };
}
