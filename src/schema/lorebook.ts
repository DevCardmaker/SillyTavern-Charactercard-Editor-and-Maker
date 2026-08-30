import { z } from "zod";

/** A single Lorebook/character_book entry, per the Character Card V2 spec. `.passthrough()`
 * keeps any vendor-specific fields (e.g. V3's `use_regex`, ST's own extras) intact through a
 * load -> edit -> save cycle even though this app doesn't render them yet. */
export const lorebookEntrySchema = z
  .object({
    keys: z.array(z.string()),
    content: z.string(),
    extensions: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean(),
    insertion_order: z.number(),
    case_sensitive: z.boolean().optional(),
    name: z.string().optional(),
    priority: z.number().optional(),
    id: z.number().optional(),
    comment: z.string().optional(),
    selective: z.boolean().optional(),
    secondary_keys: z.array(z.string()).optional(),
    constant: z.boolean().optional(),
    position: z.enum(["before_char", "after_char"]).optional(),
  })
  .passthrough();

export const lorebookSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    scan_depth: z.number().optional(),
    token_budget: z.number().optional(),
    recursive_scanning: z.boolean().optional(),
    extensions: z.record(z.string(), z.unknown()).default({}),
    entries: z.array(lorebookEntrySchema),
  })
  .passthrough();

export type LorebookEntry = z.infer<typeof lorebookEntrySchema>;
export type Lorebook = z.infer<typeof lorebookSchema>;
