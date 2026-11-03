import { extractCardJson } from "../png/characterCard";
import { readPngChunks } from "../png/pngChunks";
import type { NormalizedCard } from "../schema/normalize";
import { CardParseError, parseCardJson, parseCardJsonLeniently } from "../schema/parse";
import { splitDirAndFile } from "./fileIO";
import { listDirFiles, readBinary } from "./rawFile";

/** The older versions of a card are the copies every save and every risky AI change already leave
 * in its `backups/` folder, so the history needs no storage of its own and reaches back as far as
 * those files do. */
export interface CardVersion {
  path: string;
  time: Date;
  /** Why a copy was made outside of a normal save, e.g. "before-condense". */
  reason: string | null;
}

export interface CardVersionData {
  card: NormalizedCard;
  avatarPng: Uint8Array | null;
}

const VERSION_PATTERN = /^(.*?)(?:\.([^.]+))?\.(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.(png|json)$/i;

/** Parses a file name from the `backups/` folder; null if it isn't a version of one of `baseNames`.
 * A normal save names the copy after the file, a snapshot before an AI change after the card. */
export function parseVersionFileName(fileName: string, baseNames: string[]): Omit<CardVersion, "path"> | null {
  for (const base of baseNames) {
    if (!base || !fileName.startsWith(`${base}.`)) continue;
    const match = VERSION_PATTERN.exec(`x${fileName.slice(base.length)}`);
    if (!match || match[1] !== "x") continue;
    const [, , reason, year, month, day, hour, minute, second] = match;
    return {
      reason: reason ?? null,
      time: new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
    };
  }
  return null;
}

/** Newest first. Empty if the card has no file yet or there's no `backups/` folder. */
export async function listCardVersions(filePath: string | null, cardName: string): Promise<CardVersion[]> {
  if (!filePath) return [];
  const { dir, file } = splitDirAndFile(filePath);
  const fileBase = file.replace(/\.[^.]+$/, "");
  const cardBase = cardName.replace(/[\\/:*?"<>|]/g, "_");
  const backupDir = `${dir}backups/`;

  let names: string[];
  try {
    names = await listDirFiles(backupDir);
  } catch {
    return [];
  }
  const versions: CardVersion[] = [];
  for (const name of names) {
    const parsed = parseVersionFileName(name, [fileBase, cardBase]);
    if (parsed) versions.push({ ...parsed, path: `${backupDir}${name}` });
  }
  return versions.sort((a, b) => b.time.getTime() - a.time.getTime());
}

export async function readCardVersion(path: string): Promise<CardVersionData> {
  const bytes = await readBinary(path);
  const isPng = /\.png$/i.test(path);
  const json = isPng ? extractCardJson(bytes) : new TextDecoder().decode(bytes);
  if (!json) throw new Error("This backup doesn't contain a character card.");
  let card: NormalizedCard;
  try {
    card = parseCardJson(json);
  } catch (err) {
    const recovered = err instanceof CardParseError && err.issues ? parseCardJsonLeniently(json, err.issues) : null;
    if (!recovered) throw err;
    card = recovered;
  }
  return { card, avatarPng: isPng ? bytes : null };
}

/** A card PNG also holds the card's text, so its bytes differ after any edit. Only the image data
 * says whether the picture itself is a different one. */
export function sameImage(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b) return a === b;
  const imageData = (png: Uint8Array) => readPngChunks(png).filter((chunk) => chunk.type === "IDAT");
  try {
    const chunksA = imageData(a);
    const chunksB = imageData(b);
    return (
      chunksA.length === chunksB.length &&
      chunksA.every((chunk, i) => {
        const other = chunksB[i].data;
        return chunk.data.length === other.length && chunk.data.every((byte, j) => byte === other[j]);
      })
    );
  } catch {
    return false;
  }
}
