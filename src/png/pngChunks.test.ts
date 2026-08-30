import { describe, expect, it } from "vitest";
import { makeTextChunk, parseTextChunk, readPngChunks, writePngChunks } from "./pngChunks";
import { buildMinimalPng } from "./testFixtures";

describe("readPngChunks / writePngChunks", () => {
  it("round-trips a chunk list through serialize -> parse unchanged", () => {
    const png = buildMinimalPng();
    const chunks = readPngChunks(png);
    const reserialized = writePngChunks(chunks);
    expect(reserialized).toEqual(png);
  });

  it("parses chunk types and data in file order", () => {
    const png = buildMinimalPng();
    const chunks = readPngChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(chunks[0].data.length).toBe(13);
  });

  it("rejects a stream without a valid PNG signature", () => {
    const bogus = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(() => readPngChunks(bogus)).toThrow(/signature/);
  });

  it("rejects a truncated chunk", () => {
    const png = buildMinimalPng();
    const truncated = png.slice(0, png.length - 5);
    expect(() => readPngChunks(truncated)).toThrow(/truncated/);
  });
});

describe("makeTextChunk / parseTextChunk", () => {
  it("round-trips keyword and text", () => {
    const chunk = makeTextChunk("chara", "eyJmb28iOiJiYXIifQ==");
    const parsed = parseTextChunk(chunk);
    expect(parsed).toEqual({ keyword: "chara", text: "eyJmb28iOiJiYXIifQ==" });
  });

  it("returns null for a non-tEXt chunk", () => {
    expect(parseTextChunk({ type: "IDAT", data: new Uint8Array([1, 2, 3]) })).toBeNull();
  });

  it("rejects an empty keyword", () => {
    expect(() => makeTextChunk("", "x")).toThrow(/keyword/i);
  });
});
