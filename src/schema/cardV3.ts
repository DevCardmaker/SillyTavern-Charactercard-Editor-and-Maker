import { z } from "zod";
import { cardV2DataSchema } from "./cardV2";

const cardV3AssetSchema = z
  .object({
    type: z.string(),
    uri: z.string(),
    name: z.string(),
    ext: z.string(),
  })
  .passthrough();

/** Character Card V3 `data` object: a strict superset of V2's fields. */
export const cardV3DataSchema = cardV2DataSchema.extend({
  creator_notes_multilingual: z.record(z.string(), z.string()).optional(),
  source: z.array(z.string()).optional(),
  group_only_greetings: z.array(z.string()).default([]),
  creation_date: z.number().optional(),
  modification_date: z.number().optional(),
  nickname: z.string().optional(),
  assets: z.array(cardV3AssetSchema).optional(),
});

export const cardV3Schema = z
  .object({
    spec: z.literal("chara_card_v3"),
    spec_version: z.string().default("3.0"),
    data: cardV3DataSchema,
  })
  .passthrough();

export type CardV3Data = z.infer<typeof cardV3DataSchema>;
export type CardV3 = z.infer<typeof cardV3Schema>;
