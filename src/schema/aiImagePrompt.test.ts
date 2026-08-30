import { describe, expect, it } from "vitest";
import {
  AI_IMAGE_ART_STYLES,
  AI_IMAGE_MODEL_STYLES,
  aiImagePromptToJsonSchema,
  imageArtStyleGuidance,
  imageModelStyleGuidance,
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
