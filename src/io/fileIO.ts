import { join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { z } from "zod";
import { embedCardJson, extractCardJson } from "../png/characterCard";
import { denormalize, type NormalizedCard } from "../schema/normalize";
import { CardParseError, parseCardJson, parseCardJsonLeniently } from "../schema/parse";
import { type FileFormat, useCardStore } from "../state/cardStore";
import { useRecentCardsStore } from "../state/recentCardsStore";
import { confirmAction } from "./confirmDiscard";
import { listDirFiles, readBinary, writeBinary } from "./rawFile";

const CARD_FILTERS = [{ name: "SillyTavern character card", extensions: ["png", "json"] }];

function detectFormat(path: string): FileFormat {
  return path.toLowerCase().endsWith(".json") ? "json" : "png";
}

function splitDirAndFile(path: string): { dir: string; file: string } {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return { dir: path.slice(0, idx + 1), file: path.slice(idx + 1) };
}

function timestampForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Before overwriting `path`, copies whatever is currently there into a timestamped file under
 * a sibling `backups/` folder. No-ops if `path` doesn't exist yet (first save of a new card —
 * nothing to protect). Runs before every save so accidental overwrites are always recoverable. */
export async function backupExistingFile(path: string): Promise<void> {
  let existing: Uint8Array;
  try {
    existing = await readBinary(path);
  } catch {
    return;
  }

  const { dir, file } = splitDirAndFile(path);
  const dotIndex = file.lastIndexOf(".");
  const name = dotIndex > 0 ? file.slice(0, dotIndex) : file;
  const ext = dotIndex > 0 ? file.slice(dotIndex) : "";
  const backupPath = `${dir}backups/${name}.${timestampForFilename(new Date())}${ext}`;

  await writeBinary(backupPath, existing);
}

/** Serializes `card` into the bytes for the given target format, embedding `avatarPng` for a
 * PNG export (throws if none is set — there's nothing to embed the JSON chunk into). */
function buildCardBytes(card: NormalizedCard, format: FileFormat, avatarPng: Uint8Array | null): Uint8Array {
  const targetSpec = card.sourceSpec === "v2" ? "v2" : "v3";
  const cardObject = denormalize(card, targetSpec);
  const json = JSON.stringify(cardObject, null, 2);

  if (format === "png") {
    if (!avatarPng) {
      throw new Error(
        "A PNG export requires an avatar image. Please add an image first, or save as .json instead.",
      );
    }
    return embedCardJson(avatarPng, json);
  }
  return new TextEncoder().encode(json);
}

/** Default filename to pre-fill the save dialog with. When the card is brand new (no path yet)
 * and a `groupFolder` is set for the session, seeds the dialog into that shared folder instead of
 * wherever the dialog last remembered — see cardStore's `groupFolder` / the "Choose Group
 * Folder…" action. Cards that already have a path never pass a `groupFolder` in here (see
 * `saveCard` below), so an already-placed file is never silently redirected. */
async function defaultSavePath(name: string, ext: string, groupFolder: string | null): Promise<string | undefined> {
  if (!name) return undefined;
  const fileName = `${name}.${ext}`;
  return groupFolder ? join(groupFolder, fileName) : fileName;
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `• ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}

/** Asks before loading a card that failed strict validation but that `parseCardJsonLeniently`
 * could still recover (see there for exactly what "recover" means and its limits). */
async function confirmLoadNonConforming(issues: z.ZodIssue[]): Promise<boolean> {
  return confirmAction(
    "This file doesn't fully match the expected card format:\n\n" +
      formatIssues(issues) +
      "\n\nLoad it anyway to fix it up? Unrecognized parts (e.g. a broken lorebook) will be " +
      "dropped — the original file is backed up automatically first, so nothing is lost.",
    "Card doesn't match the format",
  );
}

/** Reads, parses and loads the card at `path` (already known to exist — from a file dialog
 * selection or a dropped file) into the store. A card that fails strict validation gets one
 * recovery attempt (see parseCardJsonLeniently) with the user's explicit confirmation and a
 * backup of the original file first; anything that recovery can't handle still throws as before. */
async function loadCardFromPath(path: string): Promise<void> {
  const bytes = await readBinary(path);
  const format = detectFormat(path);

  let json: string;
  let avatarPng: Uint8Array | null;
  if (format === "png") {
    const extracted = extractCardJson(bytes);
    if (!extracted) {
      throw new Error("This PNG file doesn't contain a SillyTavern character card.");
    }
    json = extracted;
    avatarPng = bytes;
  } else {
    json = new TextDecoder().decode(bytes);
    avatarPng = null;
  }

  let card: NormalizedCard;
  try {
    card = parseCardJson(json);
  } catch (err) {
    if (!(err instanceof CardParseError) || !err.issues) throw err;
    const recovered = parseCardJsonLeniently(json, err.issues);
    if (!recovered || !(await confirmLoadNonConforming(err.issues))) throw err;
    await backupExistingFile(path);
    card = recovered;
  }

  useCardStore.getState().loadCard(card, avatarPng, path, format);
  await useRecentCardsStore.getState().recordOpened(path);
}

/** Opens a PNG or JSON character card via a native file dialog and loads it into the store. */
export async function openCardFile(): Promise<void> {
  const selected = await open({ multiple: false, filters: CARD_FILTERS });
  if (!selected || Array.isArray(selected)) return;
  await loadCardFromPath(selected);
}

/** Loads a card from an already-known path — used by drag & drop and by clicking an entry in
 * the recent-cards list. Same loading path as "Open…", just skipping the dialog — rejects
 * anything that isn't a .png/.json before touching the filesystem. */
export async function openCardAtPath(path: string): Promise<void> {
  if (!/\.(png|json)$/i.test(path)) {
    throw new Error("Only .png and .json files can be opened as a character card.");
  }
  await loadCardFromPath(path);
}

/** Opens every .png/.json card found directly inside a chosen folder (non-recursive), each as its
 * own new tab — e.g. to reopen a group of characters saved together via the shared group folder
 * (see `saveCard`'s use of `groupFolder`). A file that fails to load (not a card, corrupt, fails
 * validation and the user declines the recovery prompt) is skipped rather than aborting the whole
 * batch; the caller gets back what happened to report a combined summary instead of one error per
 * file. Returns `{ opened: 0, failed: [] }` if the dialog is cancelled. */
export async function openFolderAsTabs(): Promise<{ opened: number; failed: string[] }> {
  const dir = await open({ directory: true });
  if (!dir || Array.isArray(dir)) return { opened: 0, failed: [] };

  const cardFileNames = (await listDirFiles(dir)).filter((name) => /\.(png|json)$/i.test(name)).sort();

  let opened = 0;
  const failed: string[] = [];
  for (const name of cardFileNames) {
    try {
      await loadCardFromPath(await join(dir, name));
      opened++;
    } catch {
      failed.push(name);
    }
  }
  return { opened, failed };
}

/** Saves every currently open tab in one shot, without a native dialog per card — the counterpart
 * to `openFolderAsTabs`. A card that already has its own path (loaded from disk, or already saved
 * once) is saved back to that same path/format, untouched by `folder` — same "never silently
 * redirect an already-placed file" rule as `defaultSavePath` above. A brand-new card (no path yet)
 * is placed at `${folder}/${name}.${ext}`; its format defaults to json rather than png when unset,
 * since a freshly generated/blank card usually has no avatar yet and `buildCardBytes` requires one
 * for png — this bulk operation shouldn't abort on the first avatarless card. Name collisions
 * within the batch (e.g. two members both named "Child") get a numeric suffix; collisions with a
 * pre-existing file on disk are handled the same way every save already is, via
 * `backupExistingFile`. A tab whose name is still blank — e.g. an accidental "+" click nobody
 * filled in — is skipped rather than saved as a nameless file; same emptiness the tab strip itself
 * already shows as "New card" instead of a real name. Failures are collected per card rather than
 * aborting the whole batch. */
export async function saveGroupToFolder(folder: string): Promise<{ saved: number; skippedEmpty: number; failed: string[] }> {
  const { characters } = useCardStore.getState();
  const usedNames = new Set<string>();

  let saved = 0;
  let skippedEmpty = 0;
  const failed: string[] = [];
  for (const slot of characters) {
    if (!slot.card.name.trim()) {
      skippedEmpty++;
      continue;
    }
    try {
      let path = slot.currentFilePath;
      let format = slot.currentFileFormat;

      if (!path) {
        format = format ?? "json";
        const baseName = slot.card.name;
        let fileName = baseName;
        let suffix = 2;
        while (usedNames.has(fileName)) {
          fileName = `${baseName}-${suffix}`;
          suffix++;
        }
        usedNames.add(fileName);
        path = await join(folder, `${fileName}.${format}`);
      }
      if (!format) continue; // unreachable: currentFilePath/currentFileFormat are always set together

      await backupExistingFile(path);
      await writeBinary(path, buildCardBytes(slot.card, format, slot.avatarPng));
      useCardStore.getState().markSlotSaved(slot.id, path, format);
      await useRecentCardsStore.getState().recordOpened(path);
      saved++;
    } catch {
      failed.push(slot.card.name);
    }
  }

  return { saved, skippedEmpty, failed };
}

/** "Save" (overwrite the current file, same format) or "Save As..." (new path, format chosen via
 * the extension). With no file open yet, "Save" behaves like "Save As...". */
export async function saveCard(mode: "save" | "saveAs"): Promise<void> {
  const state = useCardStore.getState();
  if (!state.card) return;

  let path = state.currentFilePath;
  let format = state.currentFileFormat;

  if (mode === "saveAs" || !path) {
    const defaultExt = format ?? "png";
    const chosen = await save({
      filters: CARD_FILTERS,
      defaultPath: await defaultSavePath(state.card.name, defaultExt, path ? null : state.groupFolder),
    });
    if (!chosen) return;
    path = chosen;
    format = detectFormat(chosen);
  }
  if (!path || !format) return; // unreachable: the branch above always sets both, or returns

  await backupExistingFile(path);
  await writeBinary(path, buildCardBytes(state.card, format, state.avatarPng));

  state.markSaved(path, format);
  await useRecentCardsStore.getState().recordOpened(path);
}

/** "Save as Copy...": writes the current card to a newly chosen path without changing what
 * "Save" targets — currentFilePath/currentFileFormat and the dirty flag are left untouched, so
 * the copy is a side export, not a switch to a new working file. */
export async function saveCardAsCopy(): Promise<void> {
  const state = useCardStore.getState();
  if (!state.card) return;

  const defaultExt = state.currentFileFormat ?? "png";
  const chosen = await save({
    filters: CARD_FILTERS,
    defaultPath: state.card.name ? `${state.card.name}.${defaultExt}` : undefined,
  });
  if (!chosen) return;

  const format = detectFormat(chosen);
  await backupExistingFile(chosen);
  await writeBinary(chosen, buildCardBytes(state.card, format, state.avatarPng));
}
