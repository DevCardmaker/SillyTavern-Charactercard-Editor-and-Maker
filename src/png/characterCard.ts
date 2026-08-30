import { base64ToUtf8, utf8ToBase64 } from "./base64";
import { makeTextChunk, parseTextChunk, readPngChunks, writePngChunks, type PngChunk } from "./pngChunks";

/** Keywords SillyTavern embeds card JSON under, in lookup priority order.
 * "ccv3" (Character Card V3) takes precedence when both are present, matching SillyTavern's own
 * loader — a V3-aware app should prefer the richer V3 payload over the V2-compat fallback. */
const CARD_TEXT_KEYWORDS = ["ccv3", "chara"] as const;

/** Extracts and base64-decodes the embedded character JSON from a card PNG.
 * Returns null if the PNG carries no recognized card chunk (e.g. a plain, non-card image). */
export function extractCardJson(png: Uint8Array): string | null {
  const chunks = readPngChunks(png);
  for (const keyword of CARD_TEXT_KEYWORDS) {
    for (const chunk of chunks) {
      const parsed = parseTextChunk(chunk);
      if (parsed?.keyword === keyword) {
        return base64ToUtf8(parsed.text);
      }
    }
  }
  return null;
}

/** Returns a new PNG byte stream with the given card JSON embedded under the "chara" keyword,
 * replacing any pre-existing "chara"/"ccv3" chunks. The source PNG's pixel data (the avatar
 * image itself) is left untouched. */
export function embedCardJson(png: Uint8Array, json: string): Uint8Array {
  const chunks = readPngChunks(png);
  const withoutCardChunks = chunks.filter((chunk) => {
    const parsed = parseTextChunk(chunk);
    return !(parsed && (CARD_TEXT_KEYWORDS as readonly string[]).includes(parsed.keyword));
  });

  const cardChunk = makeTextChunk("chara", utf8ToBase64(json));
  const iendIndex = withoutCardChunks.findIndex((chunk) => chunk.type === "IEND");
  const insertAt = iendIndex === -1 ? withoutCardChunks.length : iendIndex;

  const result: PngChunk[] = [...withoutCardChunks];
  result.splice(insertAt, 0, cardChunk);
  return writePngChunks(result);
}
