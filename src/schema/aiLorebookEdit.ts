import { z } from "zod";
import { cleanAiKeys } from "./aiLorebookAssist";

/** One existing lorebook entry as sent to and returned by the model for "Fill / revise entries".
 * `index` is the entry's position in the lorebook — read-only, used only to write the reply back
 * to the right entry (more robust than matching by comment/keys, which the edit may change).
 * Fresh minimal schema for the same `.passthrough()`-leak reason as aiLorebookAssist.ts. */
const aiLorebookEditEntrySchema = z.object({
  index: z.number().int(),
  keys: z.array(z.string()),
  comment: z.string(),
  content: z.string(),
});

export type AiLorebookEditEntry = z.infer<typeof aiLorebookEditEntrySchema>;

function aiLorebookEditSchema(count: number) {
  return z.object({ entries: z.array(aiLorebookEditEntrySchema).length(count) });
}

/** Same runtime-count approach as `aiRelocateToJsonSchema` — `count` is the number of entries
 * the user selected for editing, so the model can't drop or invent any. */
export function aiLorebookEditToJsonSchema(count: number): Record<string, unknown> {
  const schema = z.toJSONSchema(aiLorebookEditSchema(count)) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiLorebookEditResult =
  | { success: true; data: AiLorebookEditEntry[] }
  | { success: false; error: string };

/** Besides the shape, checks that the reply covers exactly the indices that were sent (each once) —
 * a reply that renumbers or duplicates entries would otherwise overwrite the wrong ones. */
export function parseAiLorebookEdit(expectedIndices: readonly number[], raw: unknown): ParseAiLorebookEditResult {
  const result = aiLorebookEditSchema(expectedIndices.length).safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  const returned = result.data.entries.map((e) => e.index).sort((a, b) => a - b);
  const expected = [...expectedIndices].sort((a, b) => a - b);
  if (returned.some((index, i) => index !== expected[i])) {
    return {
      success: false,
      error: `expected entries ${expected.join(", ")}, but the model returned ${returned.join(", ")}`,
    };
  }
  return { success: true, data: result.data.entries.map((e) => ({ ...e, keys: cleanAiKeys(e.keys) })) };
}
