import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** GroupX: a group of character cards as one file to pass on — a ZIP (like CharX) with
 *   group.json               { spec: "groupx", spec_version, name, members: [{ file, name }], lorebooks: [file] }
 *   cards/<name>.png|json    the cards, in the members' order (the order of first messages in a group chat)
 *   lorebooks/<name>.json    shared lorebooks (SillyTavern World Info), optional
 */
export const GROUPX_SPEC = "groupx";
export const GROUPX_VERSION = "1.0";
export const GROUPX_EXTENSION = "groupx";

export interface GroupxFile {
  /** File name inside the archive's folder (e.g. "Anna.png"). */
  fileName: string;
  bytes: Uint8Array;
}

export interface Groupx {
  name: string;
  /** In order. `name` is the card's name, for showing before opening. */
  members: (GroupxFile & { name: string })[];
  lorebooks: GroupxFile[];
}

/** A name that's safe inside the archive (and later as a file name). */
function entryName(name: string, fallback: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || fallback;
}

/** Unique names inside one folder of the archive ("Anna.png", "Anna-2.png"). */
function uniqueNames(files: GroupxFile[], fallback: string): string[] {
  const used = new Set<string>();
  return files.map((f, i) => {
    const dot = f.fileName.lastIndexOf(".");
    const base = entryName(dot > 0 ? f.fileName.slice(0, dot) : f.fileName, `${fallback}-${i + 1}`);
    const ext = dot > 0 ? f.fileName.slice(dot).toLowerCase() : "";
    let name = `${base}${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildGroupx(group: Groupx): Uint8Array {
  const cardNames = uniqueNames(group.members, "card");
  const bookNames = uniqueNames(group.lorebooks, "lorebook");
  const manifest = {
    spec: GROUPX_SPEC,
    spec_version: GROUPX_VERSION,
    name: group.name,
    members: group.members.map((m, i) => ({ file: `cards/${cardNames[i]}`, name: m.name })),
    lorebooks: bookNames.map((n) => `lorebooks/${n}`),
  };
  const files: Record<string, Uint8Array> = { "group.json": strToU8(JSON.stringify(manifest, null, 2)) };
  // PNGs are compressed already; storing them as they are is faster and no bigger.
  group.members.forEach((m, i) => (files[`cards/${cardNames[i]}`] = m.bytes));
  group.lorebooks.forEach((b, i) => (files[`lorebooks/${bookNames[i]}`] = b.bytes));
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, [bytes, { level: path.endsWith(".png") ? 0 : 6 }]])),
  );
}

/** Reads a GroupX file. Throws with a readable reason if it isn't one. */
export function parseGroupx(bytes: Uint8Array): Groupx {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("This isn't a GroupX file (not a ZIP archive).");
  }
  const manifestBytes = files["group.json"];
  if (!manifestBytes) throw new Error("This isn't a GroupX file (group.json is missing).");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error("The group description (group.json) can't be read.");
  }
  if (manifest.spec !== GROUPX_SPEC) throw new Error("This isn't a GroupX file.");
  const members = Array.isArray(manifest.members) ? manifest.members : [];
  const result: Groupx = { name: String(manifest.name ?? "").trim() || "Group", members: [], lorebooks: [] };
  for (const m of members) {
    const path = typeof m?.file === "string" ? m.file : "";
    const data = files[path];
    if (!data) throw new Error(`The group lists ${path || "a card"}, but the file is missing.`);
    result.members.push({ fileName: path.split("/").pop() ?? path, bytes: data, name: String(m?.name ?? "") });
  }
  const books = Array.isArray(manifest.lorebooks) ? manifest.lorebooks : [];
  for (const path of books) {
    if (typeof path === "string" && files[path]) result.lorebooks.push({ fileName: path.split("/").pop() ?? path, bytes: files[path] });
  }
  if (result.members.length === 0) throw new Error("The group has no cards.");
  return result;
}
