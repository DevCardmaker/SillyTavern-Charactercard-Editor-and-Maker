import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

/** Which SillyTavern file a local card or persona file belongs to, kept between starts — in the
 * app's own folder, never in the card (a card passed on shouldn't carry names from your SillyTavern). */
export interface StLinks {
  cards: Record<string, string>;
  personas: Record<string, string>;
}

const FILE = "sillytavern-links.json";

async function filePath(): Promise<string> {
  return join(await appConfigDir(), FILE);
}

function asMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export async function loadStLinks(): Promise<StLinks> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBinary(await filePath())));
    return { cards: asMap(parsed?.cards), personas: asMap(parsed?.personas) };
  } catch {
    return { cards: {}, personas: {} };
  }
}

export async function saveStLinks(links: StLinks): Promise<void> {
  await writeBinary(await filePath(), new TextEncoder().encode(JSON.stringify(links, null, 2)));
}
