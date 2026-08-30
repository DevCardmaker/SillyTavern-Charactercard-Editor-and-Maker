import { crc32 } from "./crc32";

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function writeUint32BE(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function asciiToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function bytesToAscii(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/** Parses a PNG byte stream into its signature-stripped chunk list. Throws on a malformed/truncated stream. */
export function readPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPngSignature(bytes)) {
    throw new Error("Not a valid PNG file (signature missing or incorrect).");
  }
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error("PNG file is truncated (incomplete chunk header).");
    }
    const length = readUint32BE(bytes, offset);
    const type = bytesToAscii(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`PNG file is truncated (chunk "${type}" extends past the end of the file).`);
    }
    const data = bytes.slice(dataStart, dataEnd);
    chunks.push({ type, data });
    offset = dataEnd + 4;
  }
  return chunks;
}

/** Serializes a chunk list back into a full PNG byte stream, recomputing each CRC. */
export function writePngChunks(chunks: PngChunk[]): Uint8Array {
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    const typeBytes = asciiToBytes(chunk.type);
    const crcInput = new Uint8Array(typeBytes.length + chunk.data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(chunk.data, typeBytes.length);
    parts.push(writeUint32BE(chunk.data.length));
    parts.push(typeBytes);
    parts.push(chunk.data);
    parts.push(writeUint32BE(crc32(crcInput)));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Builds a tEXt chunk (uncompressed, Latin-1 per PNG spec) from a keyword and text payload. */
export function makeTextChunk(keyword: string, text: string): PngChunk {
  if (keyword.length < 1 || keyword.length > 79) {
    throw new Error("tEXt keyword must be between 1 and 79 characters long.");
  }
  const keywordBytes = asciiToBytes(keyword);
  const textBytes = asciiToBytes(text);
  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0;
  data.set(textBytes, keywordBytes.length + 1);
  return { type: "tEXt", data };
}

/** Splits a tEXt chunk back into its keyword and text payload. Returns null for a non-tEXt chunk. */
export function parseTextChunk(chunk: PngChunk): { keyword: string; text: string } | null {
  if (chunk.type !== "tEXt") return null;
  const nullIndex = chunk.data.indexOf(0);
  if (nullIndex === -1) return null;
  return {
    keyword: bytesToAscii(chunk.data.subarray(0, nullIndex)),
    text: bytesToAscii(chunk.data.subarray(nullIndex + 1)),
  };
}
