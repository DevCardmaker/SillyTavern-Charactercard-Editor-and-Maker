import { z } from "zod";
import { lorebookSchema } from "./lorebook";

/** Character Card V2 `data` object. Fields default to empty rather than being required, since
 * many real-world cards (hand-edited, or exported by older tools) omit fields the spec added
 * later. `.passthrough()` on both this and the outer card schema preserves unknown fields
 * verbatim through a round-trip. */
export const cardV2DataSchema = z
  .object({
    name: z.string(),
    description: z.string().default(""),
    personality: z.string().default(""),
    scenario: z.string().default(""),
    first_mes: z.string().default(""),
    mes_example: z.string().default(""),

    creator_notes: z.string().default(""),
    system_prompt: z.string().default(""),
    post_history_instructions: z.string().default(""),
    alternate_greetings: z.array(z.string()).default([]),
    // SillyTavern writes an explicit `null` (not just an omitted field) when there's no lorebook.
    character_book: lorebookSchema.nullish(),

    tags: z.array(z.string()).default([]),
    creator: z.string().default(""),
    character_version: z.string().default(""),
    extensions: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const cardV2Schema = z
  .object({
    spec: z.literal("chara_card_v2"),
    spec_version: z.string().default("2.0"),
    data: cardV2DataSchema,
  })
  .passthrough();

export type CardV2Data = z.infer<typeof cardV2DataSchema>;
export type CardV2 = z.infer<typeof cardV2Schema>;
