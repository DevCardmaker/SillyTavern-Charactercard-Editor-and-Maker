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
export const AI_IMAGE_ART_STYLES = [
  "none",
  "realistic",
  "cinematic",
  "studio",
  "polaroid",
  "noir",
  "selfie",
  "cosplay",
  "watercolor",
  "oil",
  "gouache",
  "sketch",
  "charcoal",
  "ink",
  "ukiyoe",
  "nouveau",
  "anime",
  "semireal",
  "retro90s",
  "chibi",
  "vnsprite",
  "toon",
  "comic",
  "render3d",
  "pixel",
  "darkfantasy",
  "cyberpunk",
] as const;

export type AiImageArtStyle = (typeof AI_IMAGE_ART_STYLES)[number];

/** Groups for the select's <optgroup>s; "none" stays above them on its own. */
export const AI_IMAGE_ART_STYLE_GROUPS: readonly { label: string; styles: readonly AiImageArtStyle[] }[] = [
  { label: "Photo", styles: ["realistic", "cinematic", "studio", "polaroid", "noir", "selfie", "cosplay"] },
  {
    label: "Painting & drawing",
    styles: ["watercolor", "oil", "gouache", "sketch", "charcoal", "ink", "ukiyoe", "nouveau"],
  },
  {
    label: "Stylized",
    styles: ["anime", "semireal", "retro90s", "chibi", "vnsprite", "toon", "comic", "render3d", "pixel"],
  },
  { label: "Mood", styles: ["darkfantasy", "cyberpunk"] },
];

const PHOTO_STYLES: readonly AiImageArtStyle[] = AI_IMAGE_ART_STYLE_GROUPS[0].styles;

const ART_STYLE_LABELS: Record<AiImageArtStyle, string> = {
  none: "No preference",
  realistic: "Realistic photo",
  cinematic: "Cinematic",
  studio: "Studio portrait",
  polaroid: "Polaroid / vintage photo",
  noir: "Film noir",
  selfie: "Selfie / smartphone",
  cosplay: "Cosplay photo",
  watercolor: "Watercolor",
  oil: "Oil painting",
  gouache: "Gouache",
  sketch: "Pencil sketch",
  charcoal: "Charcoal",
  ink: "Ink / manga monochrome",
  ukiyoe: "Ukiyo-e woodblock",
  nouveau: "Art Nouveau",
  anime: "Anime",
  semireal: "Semi-realistic",
  retro90s: "Retro 90s anime",
  chibi: "Chibi",
  vnsprite: "Visual novel sprite",
  toon: "Toon / Cartoon",
  comic: "Western comic",
  render3d: "3D render",
  pixel: "Pixel art",
  darkfantasy: "Dark fantasy",
  cyberpunk: "Cyberpunk / neon",
};

export function imageArtStyleLabel(style: AiImageArtStyle): string {
  return ART_STYLE_LABELS[style];
}

const PHOTO_BASICS =
  'The character should look like an actual photo, not a drawing or painting. Realistic skin texture (pores, fine detail, no "airbrushed"/plastic-looking skin) and realistic color and light rendering. Avoid terms like "anime", "cartoon", "illustration", "drawing", "painting", "painted".';

const ART_STYLE_GUIDANCE: Record<AiImageArtStyle, string> = {
  none: "",
  realistic:
    'The character should look like an actual photo, not a drawing or painting. Emphasize photographic traits: realistic skin texture (pores, fine detail, no "airbrushed"/plastic-looking skin), natural or studio lighting, camera/lens terms (e.g. DSLR, 85mm lens, shallow depth of field/bokeh), realistic color and light rendering. Explicitly avoid terms like "anime", "cartoon", "illustration", "drawing", "painting", "painted".',
  cinematic: `${PHOTO_BASICS} Make it look like a still from a film: dramatic, motivated lighting, color grading, shallow depth of field, a sense of a scene around the character.`,
  studio: `${PHOTO_BASICS} A professional studio portrait: plain or seamless backdrop, soft key light with gentle fill, sharp focus on the face, clean and polished.`,
  polaroid: `${PHOTO_BASICS} An instant or vintage film photo: faded, warm colors, soft focus, visible film grain, slight light leaks, a casual snapshot feel.`,
  noir: `${PHOTO_BASICS} Film noir: black and white, hard high-contrast lighting, deep shadows, venetian-blind or streetlight patterns, a moody 1940s atmosphere.`,
  selfie: `${PHOTO_BASICS} A casual smartphone selfie: arm's-length angle, natural everyday setting, phone-camera look, candid expression.`,
  cosplay: `${PHOTO_BASICS} A cosplay photo: a real person wearing the character's costume, wig and props, photographed like at a convention or a cosplay shoot.`,
  watercolor:
    "Watercolor painting: soft translucent washes, colors bleeding into each other, visible paper texture, light loose edges, white paper showing through.",
  oil: "Oil painting: rich colors, visible brushstrokes and impasto texture, painterly light and shadow, canvas texture, like a classical painted portrait.",
  gouache:
    "Gouache painting: opaque matte colors, soft flat shapes with painterly edges, warm and gentle, like hand-painted animation backgrounds.",
  sketch:
    "Pencil sketch: graphite on paper, visible hatching and construction lines, mostly monochrome, loose expressive strokes, paper texture.",
  charcoal:
    "Charcoal drawing: rough, smudged strokes, strong dark values, high contrast, monochrome, textured paper.",
  ink: "Black-and-white manga ink style: monochrome, crisp inked lines, screentone shading, no color, like a manga page panel.",
  ukiyoe:
    "Japanese ukiyo-e woodblock print: flat areas of color, bold outlines, stylized patterns and waves or clouds, aged paper texture, Edo-period aesthetic.",
  nouveau:
    "Art Nouveau illustration: elegant flowing lines, decorative floral ornaments and a framing border, soft muted colors, a halo-like circular motif behind the character.",
  anime:
    "Anime/manga style: clean, crisp linework, cel shading, expressive large eyes, vivid colors, typical anime visual aesthetic.",
  semireal:
    "Semi-realistic digital painting: anime-inspired face and proportions but realistic rendering of skin, hair, fabric and light, highly detailed, like a gacha-game splash art or ArtStation illustration. Not a photo.",
  retro90s:
    "Retro 1990s anime style: hand-painted cel look, slightly muted VHS-era colors, softer line art, period hairstyles and character design.",
  chibi:
    "Chibi style: super-deformed, a small body with a big head (about 2–3 heads tall), cute simplified features, playful expression.",
  vnsprite:
    "Visual novel character sprite: the character standing alone on a plain white or simple background, clean anime rendering, front-facing, no scenery, easy to cut out.",
  toon: "Western cartoon/toon style: bold outlines, simplified flat shading, slightly exaggerated proportions, vivid flat colors.",
  comic:
    "Western comic book style: bold inked outlines, dynamic shading, halftone dots, saturated print colors, like a superhero comic cover. A single image, not a page of panels.",
  render3d:
    "Stylized 3D render: like a modern animated feature film character, smooth subsurface-scattered skin, soft global illumination, appealing exaggerated proportions.",
  pixel:
    "Pixel art: a low-resolution sprite look with clearly visible square pixels, a limited color palette, no anti-aliasing or smooth gradients.",
  darkfantasy:
    "Overall mood: dark fantasy. Grim, desaturated colors, dramatic low-key lighting, mist or embers, a dangerous and melancholic atmosphere. The medium is up to the instruction.",
  cyberpunk:
    "Overall mood: cyberpunk. Night, neon lights in pink, cyan and purple, rain-slick reflections, high-tech gear and city signage. The medium is up to the instruction.",
};

export function imageArtStyleGuidance(style: AiImageArtStyle): string {
  return ART_STYLE_GUIDANCE[style];
}

/** Anime models have barely seen photos, so a photo style there mostly produces a drawing that
 * looks a bit glossy. Shown as a hint rather than hiding the combination. */
export function imageArtStyleHint(modelStyle: AiImageModelStyle, artStyle: AiImageArtStyle): string {
  if (modelStyle === "anima" && PHOTO_STYLES.includes(artStyle))
    return "Anima is an anime model and draws photo looks poorly. Qwen-Image, Z-Image, Krea 2 or a realistic SDXL checkpoint work better for this style.";
  return "";
}

/** Danbooru tags for the art style, set in code for tag-based models like rating and framing. Only
 * tags these models reliably know; styles without one rely on the guidance alone. */
const ART_STYLE_TAGS: Partial<Record<AiImageArtStyle, string[]>> = {
  cinematic: ["cinematic lighting", "depth of field"],
  studio: ["photo (medium)", "simple background"],
  polaroid: ["photo (medium)", "film grain"],
  noir: ["monochrome", "greyscale", "high contrast"],
  selfie: ["selfie", "photo (medium)"],
  cosplay: ["cosplay photo"],
  watercolor: ["watercolor (medium)", "traditional media"],
  oil: ["oil painting (medium)", "traditional media"],
  gouache: ["gouache (medium)", "traditional media"],
  sketch: ["sketch", "graphite (medium)", "traditional media"],
  charcoal: ["charcoal (medium)", "monochrome", "traditional media"],
  ink: ["monochrome", "greyscale", "screentone"],
  ukiyoe: ["ukiyo-e"],
  nouveau: ["art nouveau"],
  retro90s: ["1990s (style)", "retro artstyle"],
  chibi: ["chibi"],
  vnsprite: ["simple background", "white background"],
  comic: ["western comics (style)", "halftone"],
  render3d: ["3d"],
  pixel: ["pixel art"],
  cyberpunk: ["cyberpunk", "neon lights"],
};

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

const NOT_DRAWN = "anime, cartoon, illustration, drawing, painting, 3d render, cgi, plastic skin, airbrushed skin";
const NOT_PHOTO = "photo, photorealistic, 3d render";

const NEGATIVE_ART: Record<AiImageArtStyle, string> = {
  none: "",
  realistic: NOT_DRAWN,
  cinematic: NOT_DRAWN,
  studio: `${NOT_DRAWN}, busy background`,
  polaroid: `${NOT_DRAWN}, hdr, oversaturated`,
  noir: `${NOT_DRAWN}, colorful`,
  selfie: `${NOT_DRAWN}, studio lighting`,
  cosplay: NOT_DRAWN,
  watercolor: `${NOT_PHOTO}, digital painting`,
  oil: `${NOT_PHOTO}, flat color`,
  gouache: `${NOT_PHOTO}, glossy`,
  sketch: NOT_PHOTO,
  charcoal: `${NOT_PHOTO}, colorful`,
  ink: `${NOT_PHOTO}, colorful`,
  ukiyoe: NOT_PHOTO,
  nouveau: NOT_PHOTO,
  anime: "photorealistic, realistic, photo, 3d render",
  semireal: "photo, photorealistic, chibi, flat color, sketch",
  retro90s: "photorealistic, photo, 3d render",
  chibi: "photorealistic, realistic, photo",
  vnsprite: "photo, photorealistic, detailed background, scenery",
  toon: "photorealistic, realistic, photo, anime",
  comic: "photorealistic, photo, anime, 3d render",
  render3d: "photo, photorealistic, sketch, flat color, 2d",
  pixel: "photo, photorealistic, 3d render, smooth shading",
  darkfantasy: "bright colors, pastel colors, cheerful",
  cyberpunk: "daylight",
};

/** Pony sorts its training data by source tags, so excluding the unwanted sources steers harder
 * than plain words. Photo styles exclude every drawn source; the mood styles leave the medium open. */
function ponyNegativeArt(artStyle: AiImageArtStyle): string {
  if (artStyle === "none" || artStyle === "darkfantasy" || artStyle === "cyberpunk") return "";
  if (PHOTO_STYLES.includes(artStyle)) return "source_anime, source_cartoon, source_pony, source_furry";
  if (artStyle === "anime") return "source_pony, source_furry, source_cartoon";
  if (artStyle === "toon" || artStyle === "comic") return "source_pony, source_furry, source_anime";
  return "source_pony, source_furry";
}

const TAG_STYLES: readonly AiImageModelStyle[] = ["sd", "pony", "anima"];

export function imageNegativePrompt(
  modelStyle: AiImageModelStyle,
  artStyle: AiImageArtStyle,
  rating: AiImageRating = "auto",
  framing: AiImageFraming = "auto",
): string {
  const parts = [NEGATIVE_BASE[modelStyle], NEGATIVE_ART[artStyle]];
  if (modelStyle === "pony") parts.push(ponyNegativeArt(artStyle));
  if (rating === "sfw") parts.push(modelStyle === "pony" ? "nsfw, nude, rating_explicit, rating_questionable" : "nsfw, nude, explicit");
  if (rating === "nsfw" && TAG_STYLES.includes(modelStyle)) parts.push("censored, mosaic censoring, bar censor");
  if (framing === "full") parts.push("cropped, out of frame");
  return parts.filter(Boolean).join(", ");
}

/** Who decides the rating: the LLM ("auto"), or the user, enforced in code afterwards because a
 * local model picked "sensitive" for a harmless portrait in testing. */
export const AI_IMAGE_RATINGS = ["auto", "sfw", "nsfw"] as const;

export type AiImageRating = (typeof AI_IMAGE_RATINGS)[number];

const RATING_LABELS: Record<AiImageRating, string> = {
  auto: "Let the AI decide",
  sfw: "SFW",
  nsfw: "NSFW",
};

export function imageRatingLabel(rating: AiImageRating): string {
  return RATING_LABELS[rating];
}

const RATING_GUIDANCE: Record<AiImageRating, string> = {
  auto: "",
  sfw: "The image must be safe for work: no nudity and no sexual content.",
  nsfw: "The image is meant to be NSFW; nudity and sexual content are allowed where the instruction asks for them.",
};

export function imageRatingGuidance(rating: AiImageRating): string {
  return RATING_GUIDANCE[rating];
}

/** Rating tags each tag-based model knows, and the one written for an explicit choice. */
const RATING_TAGS: Partial<Record<AiImageModelStyle, { known: string[]; sfw: string; nsfw: string; after: RegExp }>> = {
  anima: {
    known: ["safe", "sensitive", "nsfw", "explicit"],
    sfw: "safe",
    nsfw: "explicit",
    after: /^(masterpiece|best quality|good quality|normal quality|score_\d+(_up)?|newest|recent|mid|early|old)$/,
  },
  pony: {
    known: ["rating_safe", "rating_questionable", "rating_explicit"],
    sfw: "rating_safe",
    nsfw: "rating_explicit",
    after: /^(score_\d+(_up)?|source_\w+)$/,
  },
};

/** Replaces whatever rating tag the LLM wrote with the chosen one, keeping its place; without
 * one, it goes after the leading quality/score tags. */
export function applyImageRating(style: AiImageModelStyle, rating: AiImageRating, prompt: string): string {
  const tags = RATING_TAGS[style];
  if (!tags || rating === "auto") return prompt;
  const parts = prompt.split(",").map((p) => p.trim());
  const first = parts.findIndex((p) => tags.known.includes(p));
  const kept = parts.filter((p) => !tags.known.includes(p));
  let at = first;
  if (at < 0) {
    at = 0;
    while (at < kept.length && tags.after.test(kept[at])) at++;
  }
  kept.splice(at, 0, tags[rating]);
  return kept.join(", ");
}

/** SillyTavern shows avatars at 2:3. SDXL-family models were trained on ~1 megapixel buckets, of
 * which 832×1216 is the closest to 2:3; the newer models handle a little more. */
const SUGGESTED_SIZE: Record<AiImageModelStyle, string> = {
  general: "832 × 1216",
  qwen: "896 × 1344",
  zimage: "896 × 1344",
  krea2: "896 × 1344",
  sd: "832 × 1216",
  pony: "832 × 1216",
  anima: "832 × 1216",
};

export function imageSuggestedSize(style: AiImageModelStyle): string {
  return SUGGESTED_SIZE[style];
}

/** How much of the character is in the picture. Tag models get the matching Danbooru tag set in
 * code, like the rating; the others only get the instruction. */
export const AI_IMAGE_FRAMINGS = ["auto", "portrait", "upper", "cowboy", "full"] as const;

export type AiImageFraming = (typeof AI_IMAGE_FRAMINGS)[number];

const FRAMING_LABELS: Record<AiImageFraming, string> = {
  auto: "From instruction",
  portrait: "Portrait",
  upper: "Upper body",
  cowboy: "Cowboy shot (to mid-thigh)",
  full: "Full body",
};

export function imageFramingLabel(framing: AiImageFraming): string {
  return FRAMING_LABELS[framing];
}

const FRAMING_GUIDANCE: Record<AiImageFraming, string> = {
  auto: "",
  portrait: "Framing: a close-up portrait, head and shoulders.",
  upper: "Framing: upper body, from the waist up.",
  cowboy: "Framing: a cowboy shot, from the head down to mid-thigh.",
  full: "Framing: full body, the whole figure from head to feet is visible.",
};

export function imageFramingGuidance(framing: AiImageFraming): string {
  return FRAMING_GUIDANCE[framing];
}

const FRAMING_TAGS: Record<Exclude<AiImageFraming, "auto">, string> = {
  portrait: "portrait",
  upper: "upper body",
  cowboy: "cowboy shot",
  full: "full body",
};

const KNOWN_FRAMING_TAGS = ["portrait", "close-up", "upper body", "cowboy shot", "full body", "lower body"];
const SUBJECT_COUNT = /^(\d\+?(girl|boy|other)s?|solo|no humans)$/;
const LEADING_TAGS =
  /^(masterpiece|best quality|good quality|normal quality|score_\d+(_up)?|newest|recent|mid|early|old|safe|sensitive|nsfw|explicit|rating_\w+|source_\w+)$/;

/** Swaps whatever framing tags the AI wrote for the chosen one. Without one it goes after the
 * subject count ("1girl", "solo"), else after the leading quality and rating tags. */
export function applyImageFraming(style: AiImageModelStyle, framing: AiImageFraming, prompt: string): string {
  if (framing === "auto" || !TAG_STYLES.includes(style)) return prompt;
  const parts = prompt.split(",").map((p) => p.trim());
  const first = parts.findIndex((p) => KNOWN_FRAMING_TAGS.includes(p));
  const kept = parts.filter((p) => !KNOWN_FRAMING_TAGS.includes(p));
  let at = first;
  if (at < 0) {
    at = 0;
    while (at < kept.length && LEADING_TAGS.test(kept[at])) at++;
    let count = at;
    while (count < kept.length && SUBJECT_COUNT.test(kept[count])) count++;
    at = count;
  }
  kept.splice(at, 0, FRAMING_TAGS[framing]);
  return kept.join(", ");
}

/** Anima's quality tags ("masterpiece, best quality, score_7") pull hard towards polished digital
 * anime and drown out medium tags: in testing, "watercolor (medium)" and "chibi" as tags changed
 * almost nothing, while the same style as a closing sentence came through clearly every time. */
const ANIMA_STYLE_SENTENCE: Record<AiImageArtStyle, string> = {
  none: "",
  realistic: "A realistic photograph with natural skin texture and real-world lighting.",
  cinematic: "A cinematic film still with dramatic lighting and color grading.",
  studio: "A professional studio portrait photo with soft lighting on a plain backdrop.",
  polaroid: "A faded vintage polaroid photo with film grain and warm colors.",
  noir: "A black-and-white film noir scene with hard light and deep shadows.",
  selfie: "A casual smartphone selfie photo.",
  cosplay: "A real-life cosplay photo of a person in costume.",
  watercolor: "A soft watercolor painting on textured paper with bleeding colors.",
  oil: "A classical oil painting with visible brushstrokes on canvas.",
  gouache: "A gouache painting with opaque matte colors and soft painterly shapes.",
  sketch: "A loose graphite pencil sketch on paper with visible hatching.",
  charcoal: "A rough, smudged charcoal drawing in black and white.",
  ink: "A black-and-white manga page illustration with crisp ink lines and screentone.",
  ukiyoe: "A Japanese ukiyo-e woodblock print with flat colors and bold outlines.",
  nouveau: "An Art Nouveau poster with flowing lines and an ornamental floral frame.",
  anime: "A clean anime illustration with cel shading.",
  semireal: "A semi-realistic, highly detailed digital painting with realistic lighting.",
  retro90s: "A 1990s anime cel with muted VHS-era colors.",
  chibi: "A cute chibi drawing with a big head and a tiny super-deformed body.",
  vnsprite: "A visual novel character sprite on a plain white background.",
  toon: "A western cartoon with bold outlines and flat colors.",
  comic: "A western comic book cover with bold ink and halftone shading.",
  render3d: "A stylized 3D animated movie render with soft lighting.",
  pixel: "Retro pixel art with visible square pixels and a limited palette.",
  darkfantasy: "A grim dark fantasy mood with desaturated colors and dramatic shadows.",
  cyberpunk: "A cyberpunk night scene lit by pink and cyan neon.",
};

/** Puts the art style's medium tags right after the subject count and framing tags, dropping
 * copies the AI already wrote elsewhere, and for Anima closes with the style sentence. Runs after
 * `applyImageFraming`. Tag models only. */
export function applyImageArtStyle(style: AiImageModelStyle, artStyle: AiImageArtStyle, prompt: string): string {
  if (!TAG_STYLES.includes(style)) return prompt;
  // Local models copy the guidance's "Watercolor painting: soft washes" lead-in as a tag; the
  // words after the colon are usable tags, the lead-in isn't. Needs a space before and after the
  // colon so tags like "re:zero" survive.
  const parts = prompt.split(",").map((p) => p.trim().replace(/^[a-z][a-z -]* [a-z]+:\s+/i, ""));
  const tags = ART_STYLE_TAGS[artStyle] ?? [];
  const kept = parts.filter((p) => !tags.includes(p));
  let at = 0;
  while (at < kept.length && LEADING_TAGS.test(kept[at])) at++;
  while (at < kept.length && (SUBJECT_COUNT.test(kept[at]) || KNOWN_FRAMING_TAGS.includes(kept[at]))) at++;
  kept.splice(at, 0, ...tags);
  const result = kept.join(", ");
  const sentence = style === "anima" ? ANIMA_STYLE_SENTENCE[artStyle] : "";
  if (!sentence || result.includes(sentence)) return result;
  return `${result.replace(/[\s,.]+$/, "")}. ${sentence}`;
}
