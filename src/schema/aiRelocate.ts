import { z } from "zod";

/** A fresh, minimal schema rather than deriving from `cardV3DataSchema` — same `.passthrough()`-leak
 * reason as aiGroupGenerate.ts/aiConsistencyCheck.ts. `name` is read-only (used only to match a
 * reply back to its existing tab); the other five are the fields a relocation can plausibly touch
 * — deliberately excludes tags/creator_notes/system_prompt/post_history_instructions, which aren't
 * in-story content. */
const aiRelocateMemberSchema = z.object({
  name: z.string(),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  first_mes: z.string(),
  mes_example: z.string(),
});

export type AiRelocateMember = z.infer<typeof aiRelocateMemberSchema>;

function aiRelocateSchema(count: number) {
  return z.object({ characters: z.array(aiRelocateMemberSchema).length(count) });
}

/** Same "build the schema from a runtime parameter" approach as `aiGroupToJsonSchema` — `count` is
 * the number of currently open characters being relocated, not a user-chosen amount. */
export function aiRelocateToJsonSchema(count: number): Record<string, unknown> {
  const schema = z.toJSONSchema(aiRelocateSchema(count)) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiRelocateResult =
  | { success: true; data: AiRelocateMember[] }
  | { success: false; error: string };

export function parseAiRelocate(count: number, raw: unknown): ParseAiRelocateResult {
  const result = aiRelocateSchema(count).safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.characters };
}
