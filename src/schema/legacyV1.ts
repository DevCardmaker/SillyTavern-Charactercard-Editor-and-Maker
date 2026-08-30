import { z } from "zod";

/** Pre-V2 "Tavern" cards: fields sit flat at the top level, no `spec`/`data` wrapper. Still
 * shows up occasionally in older card collections, so it's accepted as a load-only fallback
 * and gets upgraded to V2 shape on the first save. */
export const legacyV1Schema = z
  .object({
    name: z.string(),
    description: z.string().default(""),
    personality: z.string().default(""),
    scenario: z.string().default(""),
    first_mes: z.string().default(""),
    mes_example: z.string().default(""),
  })
  .passthrough();

export type LegacyV1Card = z.infer<typeof legacyV1Schema>;
