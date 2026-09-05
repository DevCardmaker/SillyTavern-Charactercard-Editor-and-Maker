import { z } from "zod";

/** A fresh, minimal schema rather than deriving from `cardV3DataSchema` — same `.passthrough()`-leak
 * reason as aiGroupGenerate.ts/aiConsistencyCheck.ts. Only `scenario` is writable here: relocating a
 * group changes where/how their story plays out, not who they are (name/description/personality
 * stay untouched, matched back to the existing tab by name). */
const aiRelocateMemberSchema = z.object({
  name: z.string(),
  scenario: z.string(),
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
