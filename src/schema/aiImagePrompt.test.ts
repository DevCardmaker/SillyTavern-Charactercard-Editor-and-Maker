import { describe, expect, it } from "vitest";
import {
  AI_IMAGE_ART_STYLE_GROUPS,
  AI_IMAGE_ART_STYLES,
  AI_IMAGE_MODEL_STYLES,
  applyImageArtStyle,
  applyImageFraming,
  applyImageRating,
  aiImagePromptToJsonSchema,
  cleanImagePrompt,
  imageArtStyleGuidance,
  imageArtStyleHint,
  imageArtStyleLabel,
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

describe("applyImageFraming", () => {
  it("puts the framing tag after the subject count", () => {
    expect(applyImageFraming("anima", "cowboy", "masterpiece, score_7, newest, safe, 1girl, solo, elf")).toBe(
      "masterpiece, score_7, newest, safe, 1girl, solo, cowboy shot, elf",
    );
  });

  it("replaces conflicting framing tags the AI wrote", () => {
    expect(applyImageFraming("anima", "portrait", "score_7, 1girl, full body, elf, upper body")).toBe(
      "score_7, 1girl, portrait, elf",
    );
  });

  it("works for Pony and SD, but leaves prose models and 'auto' alone", () => {
    expect(applyImageFraming("pony", "full", "score_9, rating_safe, 1girl")).toBe("score_9, rating_safe, 1girl, full body");
    expect(applyImageFraming("sd", "upper", "1girl, smile")).toBe("1girl, upper body, smile");
    expect(applyImageFraming("qwen", "full", "A woman, smiling.")).toBe("A woman, smiling.");
    expect(applyImageFraming("anima", "auto", "1girl, full body")).toBe("1girl, full body");
  });

  it("adds a guard against cropped feet to the full-body negative prompt", () => {
    expect(imageNegativePrompt("anima", "none", "auto", "full")).toMatch(/cropped, out of frame/);
    expect(imageNegativePrompt("anima", "none", "auto", "portrait")).not.toMatch(/cropped/);
  });
});

describe("art style groups", () => {
  it("list every style except 'none' exactly once", () => {
    const grouped = AI_IMAGE_ART_STYLE_GROUPS.flatMap((g) => g.styles);
    expect([...grouped].sort()).toEqual(AI_IMAGE_ART_STYLES.filter((s) => s !== "none").sort());
  });

  it("give every style a distinct label", () => {
    const labels = AI_IMAGE_ART_STYLES.map(imageArtStyleLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("imageArtStyleHint", () => {
  it("warns about photo styles on Anima only", () => {
    expect(imageArtStyleHint("anima", "polaroid")).toMatch(/anime model/);
    expect(imageArtStyleHint("anima", "watercolor")).toBe("");
    expect(imageArtStyleHint("qwen", "polaroid")).toBe("");
  });
});

describe("applyImageArtStyle", () => {
  it("puts the medium tags after the subject count and framing", () => {
    expect(applyImageArtStyle("pony", "watercolor", "score_9, rating_safe, 1girl, solo, portrait, elf")).toBe(
      "score_9, rating_safe, 1girl, solo, portrait, watercolor (medium), traditional media, elf",
    );
  });

  it("drops copies the AI already wrote", () => {
    expect(applyImageArtStyle("pony", "chibi", "score_9, 1girl, smile, chibi")).toBe("score_9, 1girl, chibi, smile");
  });

  it("strips a copied guidance lead-in but keeps tags with a colon", () => {
    expect(applyImageArtStyle("sd", "semireal", "1girl, semi-realistic digital painting: highly detailed, re:zero")).toBe(
      "1girl, highly detailed, re:zero",
    );
  });

  it("leaves prose models and styles without tags alone", () => {
    expect(applyImageArtStyle("qwen", "watercolor", "A watercolor elf.")).toBe("A watercolor elf.");
    expect(applyImageArtStyle("sd", "semireal", "1girl, elf")).toBe("1girl, elf");
    expect(applyImageArtStyle("anima", "none", "1girl, elf")).toBe("1girl, elf");
  });
});

describe("applyImageArtStyle for Anima", () => {
  it("adds tags and closes with the style sentence, after the AI's own sentence", () => {
    expect(applyImageArtStyle("anima", "chibi", "score_7, safe, 1girl, elf, library. Warm evening light.")).toBe(
      "score_7, safe, 1girl, chibi, elf, library. Warm evening light. A cute chibi drawing with a big head and a tiny super-deformed body.",
    );
  });

  it("does not add the sentence twice", () => {
    const once = applyImageArtStyle("anima", "watercolor", "1girl, elf");
    expect(applyImageArtStyle("anima", "watercolor", once)).toBe(once);
  });

  it("has a sentence for every style except 'none'", () => {
    for (const a of AI_IMAGE_ART_STYLES.filter((s) => s !== "none"))
      expect(applyImageArtStyle("anima", a, "1girl")).toMatch(/\. [A-Z].*\.$/);
  });
});

describe("art style negatives", () => {
  it("never rule out the chosen look itself", () => {
    expect(imageNegativePrompt("anima", "watercolor")).not.toMatch(/watercolor|traditional media/);
    expect(imageNegativePrompt("anima", "noir")).not.toMatch(/monochrome|greyscale/);
    expect(imageNegativePrompt("sd", "render3d")).not.toMatch(/3d render/);
    expect(imageNegativePrompt("sd", "oil")).not.toMatch(/\bpainting\b/);
  });

  it("excludes drawn sources for Pony photo styles and leaves the mood styles open", () => {
    expect(imageNegativePrompt("pony", "cinematic")).toMatch(/source_anime, source_cartoon/);
    expect(imageNegativePrompt("pony", "cyberpunk")).not.toMatch(/source_/);
  });
});
