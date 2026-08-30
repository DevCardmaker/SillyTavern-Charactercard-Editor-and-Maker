import { z } from "zod";

const aiImagePromptSchema = z.object({ prompt: z.string() });

export function aiImagePromptToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiImagePromptSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseAiImagePromptResult = { success: true; data: string } | { success: false; error: string };

export function parseAiImagePrompt(raw: unknown): ParseAiImagePromptResult {
  const result = aiImagePromptSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data.prompt };
}

/** Image-generation models genuinely differ in what prompt shape they respond best to — this is
 * hardcoded community/vendor knowledge the LLM shouldn't have to guess, not something inferred
 * from the character description. */
export const AI_IMAGE_MODEL_STYLES = ["general", "qwen", "zimage", "krea2", "sd", "pony"] as const;

export type AiImageModelStyle = (typeof AI_IMAGE_MODEL_STYLES)[number];

const STYLE_LABELS: Record<AiImageModelStyle, string> = {
  general: "General",
  qwen: "Qwen-Image",
  zimage: "Z-Image",
  krea2: "Krea 2 / FLUX",
  sd: "Stable Diffusion (SD1.5/SDXL)",
  pony: "Pony Diffusion",
};

export function imageModelStyleLabel(style: AiImageModelStyle): string {
  return STYLE_LABELS[style];
}

const STYLE_GUIDANCE: Record<AiImageModelStyle, string> = {
  general:
    "Write a coherent, natural-language paragraph with clear visual details. No tag lists, no weighting syntax.",
  qwen: "Qwen-Image understands natural language well. Write a coherent, descriptive prose paragraph instead of a tag list.",
  zimage:
    "Z-Image works best with natural-language, concrete visual descriptions. Write a coherent paragraph, not a tag list.",
  krea2:
    "Krea 2 / FLUX models prefer a natural-language, cinematically descriptive prompt (like a short scene description) over a tag list.",
  sd: "Classic Stable Diffusion checkpoints (SD1.5/SDXL) work best with a comma-separated list of keywords/tags, most important first. Weighting syntax like (word:1.2) is common where needed.",
  pony: 'Pony Diffusion expects a specific structure: start with quality score tags ("score_9, score_8_up, score_7_up"), followed by comma-separated booru tags, optionally a source tag like "source_anime".',
};

export function imageModelStyleGuidance(style: AiImageModelStyle): string {
  return STYLE_GUIDANCE[style];
}

/** A second, independent axis from `AiImageModelStyle`: the model-style guidance controls the
 * prompt's *format* (tags vs. prose vs. Pony's score-tag convention), this controls its visual
 * *content* (what the image should look like). "none" leaves that entirely to the user's own
 * instruction, as before. */
export const AI_IMAGE_ART_STYLES = ["none", "realistic", "anime", "toon"] as const;

export type AiImageArtStyle = (typeof AI_IMAGE_ART_STYLES)[number];

const ART_STYLE_LABELS: Record<AiImageArtStyle, string> = {
  none: "No preference",
  realistic: "Realistic photo",
  anime: "Anime",
  toon: "Toon / Cartoon",
};

export function imageArtStyleLabel(style: AiImageArtStyle): string {
  return ART_STYLE_LABELS[style];
}

const ART_STYLE_GUIDANCE: Record<AiImageArtStyle, string> = {
  none: "",
  realistic:
    'The character should look like an actual photo, not a drawing or painting. Emphasize photographic traits: realistic skin texture (pores, fine detail, no "airbrushed"/plastic-looking skin), natural or studio lighting, camera/lens terms (e.g. DSLR, 85mm lens, shallow depth of field/bokeh), realistic color and light rendering. Explicitly avoid terms like "anime", "cartoon", "illustration", "drawing", "painting", "painted".',
  anime:
    "Anime/manga style: clean, crisp linework, cel shading, expressive large eyes, vivid colors, typical anime visual aesthetic.",
  toon: "Western cartoon/toon style: bold outlines, simplified flat shading, slightly exaggerated proportions, vivid flat colors.",
};

export function imageArtStyleGuidance(style: AiImageArtStyle): string {
  return ART_STYLE_GUIDANCE[style];
}
