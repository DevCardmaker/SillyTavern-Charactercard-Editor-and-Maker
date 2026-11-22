import { open, save } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { extractCardJson } from "../png/characterCard";
import { buildGroupx, GROUPX_EXTENSION, parseGroupx, type Groupx } from "../schema/groupx";
import { safeName } from "../schema/library";
import { toWorldInfo } from "../schema/lorebook";
import type { NormalizedCard } from "../schema/normalize";
import { CardParseError, parseCardJson, parseCardJsonLeniently } from "../schema/parse";
import { linkedWorldName } from "../schema/sharedLorebook";
import { libraryDirNow } from "../state/appSettingsStore";
import { useCardStore } from "../state/cardStore";
import { useLorebookStore } from "../state/lorebookStore";
import { cardFileForExport } from "./fileIO";
import type { LibraryCard } from "./library";
import { saveIntoLibrary, writeGroupOrder } from "./library";
import { parseLorebookBytes } from "./lorebookIO";
import { readBinary, writeBinary } from "./rawFile";

const GROUPX_FILTERS = [{ name: "GroupX character group", extensions: [GROUPX_EXTENSION] }];

function cardFromBytes(bytes: Uint8Array, fileName: string): NormalizedCard {
  const isPng = /\.png$/i.test(fileName);
  const json = isPng ? extractCardJson(bytes) : new TextDecoder().decode(bytes);
  if (!json) throw new Error(`${fileName} has no character card in it.`);
  try {
    return parseCardJson(json);
  } catch (err) {
    const recovered = err instanceof CardParseError && err.issues ? parseCardJsonLeniently(json, err.issues) : null;
    if (!recovered) throw err;
    return recovered;
  }
}

async function askWhereToSave(name: string): Promise<string | null> {
  const chosen = await save({
    defaultPath: await join(await libraryDirNow(), `${safeName(name, "group")}.${GROUPX_EXTENSION}`),
    filters: GROUPX_FILTERS,
  });
  if (!chosen) return null;
  return chosen.toLowerCase().endsWith(`.${GROUPX_EXTENSION}`) ? chosen : `${chosen}.${GROUPX_EXTENSION}`;
}

/** Packs open cards (in this order) into a GroupX file, with the shared lorebooks they are linked
 * to that are open in the Lorebooks mode. Returns the file's path, null if cancelled. */
export async function exportOpenCardsAsGroupx(name: string, slotIds: string[]): Promise<string | null> {
  const slots = slotIds
    .map((id) => useCardStore.getState().characters.find((c) => c.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const members = slots.map((slot) => {
    const { bytes, format } = cardFileForExport(slot.card, slot.avatarPng);
    return { fileName: `${safeName(slot.card.name)}.${format}`, bytes, name: slot.card.name };
  });
  const linkedNames = new Set(slots.map((s) => linkedWorldName(s.card)).filter((n): n is string => !!n));
  const lorebooks = useLorebookStore
    .getState()
    .lorebooks.filter((l) => l.book.name && linkedNames.has(l.book.name))
    .map((l) => ({
      fileName: `${safeName(l.book.name ?? "lorebook")}.json`,
      bytes: new TextEncoder().encode(JSON.stringify(toWorldInfo(l.book), null, 2)),
    }));
  const path = await askWhereToSave(name);
  if (!path) return null;
  await writeBinary(path, buildGroupx({ name, members, lorebooks }));
  return path;
}

/** Packs a group of the library into a GroupX file. */
export async function exportLibraryGroupAsGroupx(name: string, cards: LibraryCard[]): Promise<string | null> {
  const members = [];
  for (const card of cards) members.push({ fileName: card.fileName, bytes: await readBinary(card.path), name: card.name });
  const path = await askWhereToSave(name);
  if (!path) return null;
  await writeBinary(path, buildGroupx({ name, members, lorebooks: [] }));
  return path;
}

export async function pickGroupxFile(): Promise<string | null> {
  const selected = await open({ multiple: false, filters: GROUPX_FILTERS });
  return selected && !Array.isArray(selected) ? selected : null;
}

/** Opens every card of a GroupX file (in its order) and its lorebooks in the Lorebooks mode. */
export async function openGroupx(path: string): Promise<Groupx> {
  const group = parseGroupx(await readBinary(path));
  for (const member of group.members) {
    const card = cardFromBytes(member.bytes, member.fileName);
    useCardStore.getState().newCard();
    useCardStore.getState().updateCard(card);
    if (/\.png$/i.test(member.fileName)) useCardStore.getState().setAvatarPng(member.bytes);
  }
  for (const book of group.lorebooks) useLorebookStore.getState().addUnsaved(parseLorebookBytes(book.bytes, book.fileName));
  return group;
}

/** Unpacks a GroupX file into the library: its cards into a group folder, its lorebooks into
 * "Lorebooks". Returns the group's name. */
export async function importGroupxToLibrary(path: string): Promise<string> {
  const group = parseGroupx(await readBinary(path));
  const order: string[] = [];
  for (const member of group.members) order.push((await saveIntoLibrary(member.bytes, member.fileName, group.name)).fileName);
  await writeGroupOrder(group.name, order);
  for (const book of group.lorebooks) await saveIntoLibrary(book.bytes, book.fileName, "Lorebooks");
  return group.name;
}
