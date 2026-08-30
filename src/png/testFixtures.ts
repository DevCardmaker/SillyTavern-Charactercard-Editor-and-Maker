import { writePngChunks, type PngChunk } from "./pngChunks";

/** Builds a minimal, structurally-valid (but not necessarily renderable) PNG byte stream for
 * chunk-codec tests. The codec never interprets IHDR/IDAT pixel content, so a placeholder
 * payload is enough here — real rendering is verified manually against actual SillyTavern
 * cards, not through this synthetic fixture. */
export function buildMinimalPng(extraChunks: PngChunk[] = []): Uint8Array {
  const ihdr: PngChunk = {
    type: "IHDR",
    // width=1, height=1, bit depth=8, color type=6 (RGBA), compression/filter/interlace=0
    data: new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  };
  const idat: PngChunk = {
    type: "IDAT",
    data: new Uint8Array([0, 1, 2, 3, 4, 5]),
  };
  const iend: PngChunk = { type: "IEND", data: new Uint8Array(0) };
  return writePngChunks([ihdr, idat, ...extraChunks, iend]);
}
