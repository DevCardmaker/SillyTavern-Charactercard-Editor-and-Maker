import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

const RECENT_FILENAME = "recent-groups.json";
const MAX_ENTRIES = 5;

/** Several cards opened or saved together, so they can be reopened together in one click. */
export interface RecentGroup {
  paths: string[];
}

async function recentFilePath(): Promise<string> {
  return join(await appConfigDir(), RECENT_FILENAME);
}

/** Same cards in another order are still the same group. */
export function groupKey(paths: readonly string[]): string {
  return [...paths].sort().join("\n");
}

/** Newest first. Missing or broken config just means no history yet. */
export async function loadRecentGroups(): Promise<RecentGroup[]> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBinary(await recentFilePath())));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((g): g is RecentGroup => Array.isArray(g?.paths) && g.paths.every((p: unknown) => typeof p === "string"))
      .map((g) => ({ paths: g.paths }));
  } catch {
    return [];
  }
}

async function writeGroups(groups: RecentGroup[]): Promise<void> {
  await writeBinary(await recentFilePath(), new TextEncoder().encode(JSON.stringify(groups, null, 2)));
}

/** Moves the group to the front (dropping an earlier entry with the same cards). A single card
 * isn't a group, so fewer than two paths change nothing. */
export async function recordRecentGroup(paths: string[]): Promise<RecentGroup[]> {
  const current = await loadRecentGroups();
  const unique = [...new Set(paths)];
  if (unique.length < 2) return current;
  const key = groupKey(unique);
  const next = [{ paths: unique }, ...current.filter((g) => groupKey(g.paths) !== key)].slice(0, MAX_ENTRIES);
  await writeGroups(next);
  return next;
}

export async function removeRecentGroup(paths: string[]): Promise<RecentGroup[]> {
  const key = groupKey(paths);
  const next = (await loadRecentGroups()).filter((g) => groupKey(g.paths) !== key);
  await writeGroups(next);
  return next;
}

function baseName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.(png|json)$/i, "");
}

/** The folder's name when all cards share one (how a saved group usually lives), otherwise the
 * first card names. */
export function groupLabel(paths: readonly string[]): string {
  const dirs = new Set(paths.map((p) => p.replace(/[\\/][^\\/]*$/, "")));
  if (dirs.size === 1) {
    const folder = [...dirs][0].split(/[\\/]/).pop();
    if (folder) return folder;
  }
  const names = paths.map(baseName);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}

export function groupMemberNames(paths: readonly string[]): string[] {
  return paths.map(baseName);
}
