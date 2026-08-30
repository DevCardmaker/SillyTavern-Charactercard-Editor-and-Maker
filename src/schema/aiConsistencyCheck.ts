import { z } from "zod";

/** A fresh, minimal schema rather than deriving from `cardV3DataSchema` — see aiLorebookAssist.ts
 * for why: that schema's `.passthrough()` leaks into nested array items as `additionalProperties:
 * {}` when converted via `z.toJSONSchema()`, which a top-level override alone can't undo. */
const aiConsistencyFindingSchema = z.object({
  characters: z.array(z.string()),
  issue: z.string(),
});

export type AiConsistencyFinding = z.infer<typeof aiConsistencyFindingSchema>;

const aiConsistencyCheckSchema = z.object({ findings: z.array(aiConsistencyFindingSchema) });

/** `response_format: json_schema` requires an object at the top level, hence the `{ findings }`
 * wrapper rather than a bare array schema. */
export function aiConsistencyCheckToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiConsistencyCheckSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiConsistencyCheckResult =
  | { success: true; data: AiConsistencyFinding[] }
  | { success: false; error: string };

export function parseAiConsistencyCheck(raw: unknown): ParseAiConsistencyCheckResult {
  const result = aiConsistencyCheckSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.findings };
}
