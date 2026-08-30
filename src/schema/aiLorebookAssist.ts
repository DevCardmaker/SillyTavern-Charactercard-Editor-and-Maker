import { z } from "zod";

/** Deliberately a fresh, minimal schema instead of `lorebookEntrySchema.pick(...)` — the real
 * schema's `.passthrough()` leaks into nested array items as `additionalProperties: {}` when
 * converted via `z.toJSONSchema()`, which a single top-level override (as used in `aiAssist.ts`)
 * can't fix for a nested shape. `comment` doubles as a short human-readable label for the draft
 * list UI (it's a real, existing optional field on `lorebookEntrySchema`, not a made-up one). */
const aiLorebookEntrySchema = z.object({
  keys: z.array(z.string()),
  content: z.string(),
  comment: z.string().optional(),
});

export type AiLorebookEntryDraft = z.infer<typeof aiLorebookEntrySchema>;

const aiLorebookEntriesSchema = z.object({ entries: z.array(aiLorebookEntrySchema) });

/** `response_format: json_schema` requires an object at the top level, hence the `{ entries }`
 * wrapper rather than a bare array schema. */
export function aiLorebookEntriesToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiLorebookEntriesSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiLorebookEntriesResult =
  | { success: true; data: AiLorebookEntryDraft[] }
  | { success: false; error: string };

export function parseAiLorebookEntries(raw: unknown): ParseAiLorebookEntriesResult {
  const result = aiLorebookEntriesSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.entries };
}
