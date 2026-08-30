import { describe, expect, it } from "vitest";
import { utf8ToBase64 } from "./base64";
import { embedCardJson, extractCardJson } from "./characterCard";
import { makeTextChunk, readPngChunks, writePngChunks } from "./pngChunks";
import { buildMinimalPng } from "./testFixtures";

const SAMPLE_CARD = JSON.stringify({
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Zoë 🌸",
    description: "A test card with unicode and emoji, for round-trip testing.",
    personality: "",
    scenario: "",
    first_mes: "Hello!",
    mes_example: "",
  },
});

describe("extractCardJson", () => {
  it("returns null for a plain PNG without an embedded card", () => {
    expect(extractCardJson(buildMinimalPng())).toBeNull();
  });

  it("prefers a ccv3 chunk over a chara chunk when both are present", () => {
    const v2Json = JSON.stringify({ spec: "chara_card_v2", data: { name: "V2" } });
    const v3Json = JSON.stringify({ spec: "chara_card_v3", data: { name: "V3" } });
    const png = buildMinimalPng([
      makeTextChunk("chara", utf8ToBase64(v2Json)),
      makeTextChunk("ccv3", utf8ToBase64(v3Json)),
    ]);
    expect(extractCardJson(png)).toBe(v3Json);
  });
});

describe("embedCardJson", () => {
  it("round-trips arbitrary JSON, including unicode, byte-for-byte", () => {
    const png = embedCardJson(buildMinimalPng(), SAMPLE_CARD);
    expect(extractCardJson(png)).toBe(SAMPLE_CARD);
  });

  it("replaces a pre-existing chara chunk rather than duplicating it", () => {
    const first = embedCardJson(buildMinimalPng(), JSON.stringify({ data: { name: "Old" } }));
    const second = embedCardJson(first, JSON.stringify({ data: { name: "New" } }));

    expect(extractCardJson(second)).toBe(JSON.stringify({ data: { name: "New" } }));
    const charaChunks = readPngChunks(second).filter((c) => c.type === "tEXt");
    expect(charaChunks).toHaveLength(1);
  });

  it("keeps IEND as the last chunk", () => {
    const png = embedCardJson(buildMinimalPng(), SAMPLE_CARD);
    const chunks = readPngChunks(png);
    expect(chunks[chunks.length - 1].type).toBe("IEND");
  });

  it("leaves the original PNG's other chunks (e.g. pixel data) untouched", () => {
    const original = buildMinimalPng();
    const originalIdat = readPngChunks(original).find((c) => c.type === "IDAT")!.data;

    const withCard = embedCardJson(original, SAMPLE_CARD);
    const newIdat = readPngChunks(withCard).find((c) => c.type === "IDAT")!.data;

    expect(newIdat).toEqual(originalIdat);
  });

  it("is stable under a second full write/parse cycle", () => {
    const once = embedCardJson(buildMinimalPng(), SAMPLE_CARD);
    const twice = writePngChunks(readPngChunks(once));
    expect(twice).toEqual(once);
    expect(extractCardJson(twice)).toBe(SAMPLE_CARD);
  });
});
