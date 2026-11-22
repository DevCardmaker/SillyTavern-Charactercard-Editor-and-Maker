import { embedCardJson } from "../png/characterCard";
import { denormalize, type NormalizedCard } from "../schema/normalize";
import { keptAttributes, sameNameCharacters, sameNamePersonas, type StCharacter, type StGroup, type StPersona } from "../schema/sillyTavern";
import { useCardStore } from "../state/cardStore";
import { usePersonaStore } from "../state/personaStore";
import { useSillyTavernStore } from "../state/sillyTavernStore";
import { cardFileForExport, writeSnapshotBytes } from "./fileIO";
import { readLorebookAtPath } from "./lorebookIO";
import { readBinary } from "./rawFile";
import { toWorldInfo } from "../schema/lorebook";
import {
  cardFromPng,
  stCreateGroup,
  stExportCharacterPng,
  stImportCharacter,
  stGetWorld,
  stListCharacters,
  stListWorlds,
  stSaveWorld,
  stMergeAttributes,
  stPersonaPicture,
  stSendPersona,
} from "./sillyTavernClient";

async function config() {
  return useSillyTavernStore.getState().ensureConfig();
}

/** SillyTavern's lists, loaded if they aren't yet. */
async function lists() {
  const store = useSillyTavernStore.getState();
  if (!store.characters || !store.personas) await store.refresh();
  const { characters, personas, error } = useSillyTavernStore.getState();
  if (!characters || !personas) throw new Error(error ?? "SillyTavern's lists could not be loaded.");
  return { characters, personas };
}

function forgetThumbnail(key: string) {
  useSillyTavernStore.setState((s) => {
    const { [key]: _gone, ...rest } = s.thumbnails;
    return { thumbnails: rest };
  });
}

// ── Characters ─────────────────────────────────────────────────────────────────────────────────

/** Opens a SillyTavern character as a new card, linked to its file for sending it back. */
export async function openStCharacter(avatar: string): Promise<void> {
  const png = await stExportCharacterPng(await config(), avatar);
  const card = cardFromPng(png);
  const store = useCardStore.getState();
  store.newCard();
  useCardStore.getState().updateCard(card);
  useCardStore.getState().setAvatarPng(png);
  const slotId = useCardStore.getState().activeId;
  if (slotId) useSillyTavernStore.getState().linkCard(slotId, avatar);
}

export async function openStGroupMembers(group: StGroup): Promise<string[]> {
  const failed: string[] = [];
  for (const avatar of group.members) {
    try {
      await openStCharacter(avatar);
    } catch {
      failed.push(avatar);
    }
  }
  return failed;
}

/** Where an open card would go: the file it came from, and other characters with its name. */
export interface CardSendPlan {
  slotId: string;
  name: string;
  linked: StCharacter | null;
  sameName: StCharacter[];
}

export async function planCardSend(slotId: string): Promise<CardSendPlan> {
  const slot = useCardStore.getState().characters.find((c) => c.id === slotId);
  if (!slot) throw new Error("This card isn't open any more.");
  const { characters } = await lists();
  const linkedFile = await useSillyTavernStore.getState().linkedCard(slotId);
  const linked = characters.find((c) => c.avatar === linkedFile) ?? null;
  const sameName = sameNameCharacters(characters, slot.card.name).filter((c) => c.avatar !== linked?.avatar);
  return { slotId, name: slot.card.name, linked, sameName };
}

/** Sends an open card to SillyTavern: as a new character, or over `replace` (a file name). Before
 * overwriting, SillyTavern's version is kept as a snapshot of the card ("before sillytavern" in the
 * Snapshots tab). Returns the character's file name in SillyTavern. */
export async function sendCardToSt(slotId: string, replace: string | null): Promise<string> {
  const slot = useCardStore.getState().characters.find((c) => c.id === slotId);
  if (!slot) throw new Error("This card isn't open any more.");
  const avatar = await sendCardDataToSt(
    { name: slot.card.name, json: cardJson(slot.card), picture: slot.avatarPng, fallback: () => cardFileForExport(slot.card, null), filePath: slot.currentFilePath },
    replace,
  );
  useSillyTavernStore.getState().linkCard(slotId, avatar);
  return avatar;
}

/** Sends a card file (e.g. from the library) without opening it — same safety steps as above. */
export async function sendCardFileToSt(path: string, name: string, replace: string | null): Promise<string> {
  const bytes = await readBinary(path);
  const isPng = /\.png$/i.test(path);
  const card = isPng ? cardFromPng(bytes) : null;
  return sendCardDataToSt(
    {
      name,
      json: isPng && card ? cardJson(card) : new TextDecoder().decode(bytes),
      picture: isPng ? bytes : null,
      fallback: () => ({ bytes, format: "json" }),
      filePath: null,
    },
    replace,
  );
}

async function sendCardDataToSt(
  data: {
    name: string;
    json: string;
    picture: Uint8Array | null;
    fallback: () => { bytes: Uint8Array; format: "png" | "json" };
    filePath: string | null;
  },
  replace: string | null,
): Promise<string> {
  if (!data.name.trim()) throw new Error("Give the card a name first — SillyTavern needs one.");
  const cfg = await config();
  let picture = data.picture;
  // Read fresh, right before overwriting: the star and the current chat as they are now.
  const before = replace ? (await stListCharacters(cfg)).find((c) => c.avatar === replace) : undefined;
  if (replace) {
    const previous = await stExportCharacterPng(cfg, replace);
    await writeSnapshotBytes(data.name, data.filePath, "before-sillytavern", previous, "png");
    // Without a picture of its own the card would get SillyTavern's default one; keep the old one.
    picture ??= previous;
  }
  const file = picture ? { bytes: embedCardJson(picture, data.json), format: "png" as const } : data.fallback();
  const avatar = await stImportCharacter(cfg, file, replace ?? undefined);
  // SillyTavern resets both on every import; put them back so overwriting changes only the card.
  if (before && (before.fav || before.chat)) await stMergeAttributes(cfg, keptAttributes(before));
  forgetThumbnail(`avatar:${avatar}`);
  return avatar;
}

/** Sends a lorebook file to SillyTavern as World Info, under `name` — over a World Info file of that
 * name if one exists, after keeping SillyTavern's version as a snapshot in the app's folder. */
export async function sendLorebookFileToSt(path: string, name: string): Promise<void> {
  const cfg = await config();
  const book = await readLorebookAtPath(path);
  if ((await stListWorlds(cfg)).includes(name)) {
    await writeSnapshotBytes(name, null, "before-sillytavern", await stGetWorld(cfg, name), "json");
  }
  await stSaveWorld(cfg, name, toWorldInfo(book));
}

function cardJson(card: NormalizedCard): string {
  return JSON.stringify(denormalize(card, card.sourceSpec === "v2" ? "v2" : "v3"), null, 2);
}

/** Creates a group in SillyTavern from open cards, in this order. Each card is sent first, to the
 * target chosen for it (`replace` file name, or null for a new character). */
export async function createStGroupFromCards(name: string, members: { slotId: string; replace: string | null }[]): Promise<void> {
  const files: string[] = [];
  for (const member of members) files.push(await sendCardToSt(member.slotId, member.replace));
  await stCreateGroup(await config(), name.trim() || "New group", files);
}

// ── Personas ───────────────────────────────────────────────────────────────────────────────────

export async function openStPersona(persona: StPersona): Promise<void> {
  const picture = await stPersonaPicture(await config(), persona.avatar);
  const store = usePersonaStore.getState();
  store.newCard();
  usePersonaStore.getState().updateCard({ name: persona.name, description: persona.description });
  if (picture) usePersonaStore.getState().setAvatarPng(picture);
  const slotId = usePersonaStore.getState().activeId;
  if (slotId) useSillyTavernStore.getState().linkPersona(slotId, persona.avatar);
}

export interface PersonaSendPlan {
  slotId: string;
  name: string;
  linked: StPersona | null;
  sameName: StPersona[];
}

export async function planPersonaSend(slotId: string): Promise<PersonaSendPlan> {
  const slot = usePersonaStore.getState().characters.find((c) => c.id === slotId);
  if (!slot) throw new Error("This persona isn't open any more.");
  const { personas } = await lists();
  const linkedFile = await useSillyTavernStore.getState().linkedPersona(slotId);
  const linked = personas.find((p) => p.avatar === linkedFile) ?? null;
  const sameName = sameNamePersonas(personas, slot.card.name).filter((p) => p.avatar !== linked?.avatar);
  return { slotId, name: slot.card.name, linked, sameName };
}

export async function sendPersonaToSt(slotId: string, replace: string | null): Promise<string> {
  const slot = usePersonaStore.getState().characters.find((c) => c.id === slotId);
  if (!slot) throw new Error("This persona isn't open any more.");
  if (!slot.card.name.trim()) throw new Error("Give the persona a name first.");
  const avatar = await stSendPersona(
    await config(),
    { name: slot.card.name.trim(), description: slot.card.description, avatarPng: slot.avatarPng },
    replace ?? undefined,
  );
  useSillyTavernStore.getState().linkPersona(slotId, avatar);
  forgetThumbnail(`persona:${avatar}`);
  return avatar;
}
