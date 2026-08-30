import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

const RECENT_FILENAME = "recent-cards.json";
const MAX_ENTRIES = 5;

async function recentFilePath(): Promise<string> {
  return join(await appConfigDir(), RECENT_FILENAME);
}

/** Absolute paths of the most recently opened/saved cards, newest first. Missing or corrupted
 * config just means "no history yet" — this is a convenience list, not something that should
 * ever block the app from starting. */
export async function loadRecentCards(): Promise<string[]> {
  try {
    const bytes = await readBinary(await recentFilePath());
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Moves `path` to the front of the recent list (removing any earlier occurrence first) and
 * truncates to the last 5 entries. Returns the updated list. */
export async function recordRecentCard(path: string): Promise<string[]> {
  const target = await recentFilePath();
  const current = await loadRecentCards();
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_ENTRIES);
  await writeBinary(target, new TextEncoder().encode(JSON.stringify(next, null, 2)));
  return next;
}

/** Drops entries whose file no longer exists (moved/deleted since they were recorded). Takes a
 * batch rather than one path at a time so several stale entries found at once — e.g. all of them
 * on first load after external cleanup — collapse into a single read-modify-write instead of
 * racing each other over the same file. Returns the updated list. */
export async function removeRecentCards(paths: string[]): Promise<string[]> {
  const target = await recentFilePath();
  const current = await loadRecentCards();
  const toRemove = new Set(paths);
  const next = current.filter((p) => !toRemove.has(p));
  await writeBinary(target, new TextEncoder().encode(JSON.stringify(next, null, 2)));
  return next;
}
