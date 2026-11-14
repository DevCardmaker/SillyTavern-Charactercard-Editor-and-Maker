import { describe, expect, it } from "vitest";
import {
  AI_IMAGE_ART_STYLES,
  AI_IMAGE_MODEL_STYLES,
  applyImageRating,
  aiImagePromptToJsonSchema,
  cleanImagePrompt,
  imageArtStyleGuidance,
  imageModelStyleGuidance,
  imageNegativePrompt,
  imageSuggestedSize,
  parseAiImagePrompt,
} from "./aiImagePrompt";

describe("aiImagePromptToJsonSchema", () => {
  it("produces an object schema forbidding additional properties", () => {
    const schema = aiImagePromptToJsonSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("prompt");
  });
});

describe("parseAiImagePrompt", () => {
  it("accepts a valid reply", () => {
    expect(parseAiImagePrompt({ prompt: "a young woman with red hair" })).toEqual({
      success: true,
      data: "a young woman with red hair",
    });
  });

  it("rejects a reply missing the prompt field", () => {
    expect(parseAiImagePrompt({}).success).toBe(false);
  });

  it("rejects a reply where prompt isn't a string", () => {
    expect(parseAiImagePrompt({ prompt: 123 }).success).toBe(false);
  });
});

describe("imageModelStyleGuidance", () => {
  it("returns a non-empty, distinct guidance string for every style", () => {
    const texts = AI_IMAGE_MODEL_STYLES.map(imageModelStyleGuidance);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("gives Pony its specific score-tag convention, distinct from the tag-list-only SD guidance", () => {
    expect(imageModelStyleGuidance("pony")).toMatch(/score_9/);
    expect(imageModelStyleGuidance("sd")).not.toMatch(/score_9/);
  });

  it("gives Anima its tag order, @ artist prefix and spaces instead of underscores", () => {
    const anima = imageModelStyleGuidance("anima");
    expect(anima).toMatch(/masterpiece, best quality, score_7/);
    expect(anima).toMatch(/"@"/);
    expect(anima).toMatch(/"long hair", not "long_hair"/);
    expect(anima).toMatch(/never invent artists/);
  });
});

describe("imageArtStyleGuidance", () => {
  it("leaves 'none' empty so the user's own instruction stays in full control", () => {
    expect(imageArtStyleGuidance("none")).toBe("");
  });

  it("returns distinct, non-empty guidance for the other styles", () => {
    const texts = AI_IMAGE_ART_STYLES.filter((s) => s !== "none").map(imageArtStyleGuidance);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("explicitly excludes anime/cartoon terms from the realistic-photo guidance", () => {
    const realistic = imageArtStyleGuidance("realistic");
    expect(realistic).toMatch(/camera|lens|skin texture/);
    expect(realistic.toLowerCase()).toContain("anime");
  });
});

describe("cleanImagePrompt", () => {
  it("turns underscores into spaces for Anima but keeps score tags intact", () => {
    expect(cleanImagePrompt("anima", "score_7, long_hair, green_eyes, 1girl")).toBe("score_7, long hair, green eyes, 1girl");
  });

  it("leaves other styles untouched", () => {
    expect(cleanImagePrompt("pony", "score_9, long_hair")).toBe("score_9, long_hair");
  });
});

describe("imageNegativePrompt", () => {
  it("returns non-empty negatives for every model and art style combination", () => {
    for (const m of AI_IMAGE_MODEL_STYLES)
      for (const a of AI_IMAGE_ART_STYLES) expect(imageNegativePrompt(m, a).length).toBeGreaterThan(0);
  });

  it("uses Anima's own low score tags", () => {
    expect(imageNegativePrompt("anima", "none")).toMatch(/^worst quality, low quality, score_1, score_2, score_3/);
  });

  it("excludes the look the art style rules out", () => {
    expect(imageNegativePrompt("sd", "realistic")).toMatch(/anime, cartoon/);
    expect(imageNegativePrompt("sd", "anime")).toMatch(/photorealistic/);
    expect(imageNegativePrompt("sd", "none")).not.toMatch(/anime|photorealistic/);
  });

  it("adds Pony source tags only for Pony", () => {
    expect(imageNegativePrompt("pony", "realistic")).toMatch(/source_anime/);
    expect(imageNegativePrompt("sd", "realistic")).not.toMatch(/source_/);
  });
});

describe("applyImageRating", () => {
  it("replaces the rating tag the AI picked, keeping its place", () => {
    expect(applyImageRating("anima", "sfw", "masterpiece, score_7, newest, sensitive, 1girl, elf")).toBe(
      "masterpiece, score_7, newest, safe, 1girl, elf",
    );
  });

  it("inserts a missing rating after the leading quality and period tags", () => {
    expect(applyImageRating("anima", "nsfw", "masterpiece, best quality, score_7, newest, 1girl")).toBe(
      "masterpiece, best quality, score_7, newest, explicit, 1girl",
    );
  });

  it("removes duplicate rating tags", () => {
    expect(applyImageRating("anima", "sfw", "score_7, safe, 1girl, nsfw")).toBe("score_7, safe, 1girl");
  });

  it("uses Pony's own rating tags after the score and source tags", () => {
    expect(applyImageRating("pony", "sfw", "score_9, score_8_up, source_anime, 1girl")).toBe(
      "score_9, score_8_up, source_anime, rating_safe, 1girl",
    );
  });

  it("leaves the prompt alone for 'auto' and for prose models", () => {
    expect(applyImageRating("anima", "auto", "score_7, sensitive, 1girl")).toBe("score_7, sensitive, 1girl");
    expect(applyImageRating("qwen", "sfw", "A woman, smiling.")).toBe("A woman, smiling.");
  });
});

describe("imageNegativePrompt with a rating", () => {
  it("rules out nudity for SFW and censoring for NSFW on tag models", () => {
    expect(imageNegativePrompt("anima", "none", "sfw")).toMatch(/nsfw, nude/);
    expect(imageNegativePrompt("pony", "none", "sfw")).toMatch(/rating_explicit/);
    expect(imageNegativePrompt("anima", "none", "nsfw")).toMatch(/censored/);
    expect(imageNegativePrompt("qwen", "none", "nsfw")).not.toMatch(/censored/);
  });
});

describe("imageSuggestedSize", () => {
  it("suggests a 2:3 portrait size for every model", () => {
    for (const m of AI_IMAGE_MODEL_STYLES) {
      const [w, h] = imageSuggestedSize(m).split(" × ").map(Number);
      expect(h / w).toBeCloseTo(1.5, 1);
    }
  });
});
