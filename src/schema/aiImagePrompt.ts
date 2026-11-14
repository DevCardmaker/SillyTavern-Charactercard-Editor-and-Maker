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
export const AI_IMAGE_MODEL_STYLES = ["general", "qwen", "zimage", "krea2", "sd", "pony", "anima"] as const;

export type AiImageModelStyle = (typeof AI_IMAGE_MODEL_STYLES)[number];

const STYLE_LABELS: Record<AiImageModelStyle, string> = {
  general: "General",
  qwen: "Qwen-Image",
  zimage: "Z-Image",
  krea2: "Krea 2 / FLUX",
  sd: "Stable Diffusion (SD1.5/SDXL)",
  pony: "Pony Diffusion",
  anima: "Anima",
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
  anima:
    'Anima is an anime model trained on Danbooru tags. Write comma-separated Danbooru tags in this order: quality tags "masterpiece, best quality, score_7", a period tag like "newest", one rating tag that fits the image ("safe", "sensitive", "nsfw" or "explicit"), the subject count ("1girl", "1boy", "2girls", …), then character and series tags only for an existing, well-known character, then the remaining appearance, clothing, pose, expression and background tags. Write tags in lowercase with spaces instead of underscores ("long hair", not "long_hair"); only score tags keep their underscore. Artist tags start with "@", but only add one if the instruction names an artist; never invent artists. No weighting syntax like (word:1.2). After the tags you may add one short English sentence for composition or lighting that tags cannot express.',
};

export function imageModelStyleGuidance(style: AiImageModelStyle): string {
  return STYLE_GUIDANCE[style];
}

/** Local models still slip into Danbooru's underscore spelling now and then, which Anima wasn't
 * trained on; fixed here instead of piling more rules onto the prompt. Score tags keep theirs. */
export function cleanImagePrompt(style: AiImageModelStyle, prompt: string): string {
  if (style !== "anima") return prompt;
  return prompt.replace(/(?<!\bscore)_/g, " ");
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

/** Negative prompts are model knowledge, not character knowledge: mostly each model family's own
 * low-quality tags, plus a guard against the look the chosen art style rules out. Hardcoded like
 * the guidance above instead of asking the LLM. */
const NEGATIVE_BASE: Record<AiImageModelStyle, string> = {
  general: "low quality, worst quality, blurry, jpeg artifacts, watermark, text, signature, bad anatomy, deformed hands, extra fingers",
  qwen: "low quality, blurry, jpeg artifacts, watermark, text, signature, bad anatomy, deformed hands, extra fingers",
  zimage: "low quality, blurry, jpeg artifacts, watermark, text, signature, bad anatomy, deformed hands, extra fingers",
  krea2: "low quality, blurry, jpeg artifacts, watermark, text, signature, bad anatomy, deformed hands, extra fingers",
  sd: "worst quality, low quality, normal quality, lowres, blurry, jpeg artifacts, watermark, text, signature, username, bad anatomy, bad hands, extra fingers, missing fingers, deformed",
  pony: "score_4, score_5, score_6, worst quality, low quality, lowres, blurry, jpeg artifacts, watermark, signature, text, bad anatomy, bad hands, extra fingers",
  anima: "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia",
};

const NEGATIVE_ART: Record<AiImageArtStyle, string> = {
  none: "",
  realistic: "anime, cartoon, illustration, drawing, painting, 3d render, cgi, plastic skin, airbrushed skin",
  anime: "photorealistic, realistic, photo, 3d render",
  toon: "photorealistic, realistic, photo, anime",
};

/** Pony sorts its training data by source tags, so excluding the unwanted sources steers harder
 * than plain words. */
const PONY_NEGATIVE_ART: Record<AiImageArtStyle, string> = {
  none: "",
  realistic: "source_anime, source_cartoon, source_pony, source_furry",
  anime: "source_pony, source_furry, source_cartoon",
  toon: "source_pony, source_furry, source_anime",
};

export function imageNegativePrompt(modelStyle: AiImageModelStyle, artStyle: AiImageArtStyle): string {
  const parts = [NEGATIVE_BASE[modelStyle], NEGATIVE_ART[artStyle]];
  if (modelStyle === "pony") parts.push(PONY_NEGATIVE_ART[artStyle]);
  return parts.filter(Boolean).join(", ");
}
