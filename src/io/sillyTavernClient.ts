import { invoke } from "@tauri-apps/api/core";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { extractCardJson } from "../png/characterCard";
import type { NormalizedCard } from "../schema/normalize";
import { CardParseError, parseCardJson, parseCardJsonLeniently } from "../schema/parse";
import {
  parseStCharacters,
  parseStGroups,
  parseStSettings,
  personasFromSettings,
  withPersona,
  type StCharacter,
  type StGroup,
  type StPersona,
} from "../schema/sillyTavern";
import { readBinary, writeBinary } from "./rawFile";

/** Where SillyTavern runs, and a login if it uses basicAuthMode. */
export interface StConfig {
  baseUrl: string;
  basicUser: string;
  basicPassword: string;
}

const CONFIG_FILE = "sillytavern.json";
export const EMPTY_ST_CONFIG: StConfig = { baseUrl: "", basicUser: "", basicPassword: "" };

async function configPath(): Promise<string> {
  return join(await appConfigDir(), CONFIG_FILE);
}

export async function loadStConfig(): Promise<StConfig> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBinary(await configPath())));
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      basicUser: typeof parsed.basicUser === "string" ? parsed.basicUser : "",
      basicPassword: typeof parsed.basicPassword === "string" ? parsed.basicPassword : "",
    };
  } catch {
    return { ...EMPTY_ST_CONFIG };
  }
}

export async function saveStConfig(config: StConfig): Promise<void> {
  await writeBinary(await configPath(), new TextEncoder().encode(JSON.stringify(config, null, 2)));
}

interface RawResponse {
  status: number;
  content_type: string;
  headers: Record<string, string>;
  body: number[];
}

export interface StRawResult {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

interface CallOptions {
  method?: "GET" | "POST";
  json?: unknown;
  file?: { fileName: string; bytes: Uint8Array };
  fields?: Record<string, string>;
}

/** One request with SillyTavern's whole answer, error statuses included. */
export async function stCallRaw(config: StConfig, path: string, options: CallOptions = {}): Promise<StRawResult> {
  const response = await invoke<RawResponse>("st_request", {
    req: {
      base_url: config.baseUrl,
      path,
      method: options.method ?? "POST",
      json: options.file ? null : (options.json ?? {}),
      file: options.file ? { file_name: options.file.fileName, bytes: Array.from(options.file.bytes) } : null,
      fields: options.fields ?? null,
      basic_user: config.basicUser || null,
      basic_password: config.basicPassword || null,
    },
  });
  return {
    status: response.status,
    contentType: response.content_type,
    headers: response.headers ?? {},
    body: Uint8Array.from(response.body),
  };
}

async function call(config: StConfig, path: string, options: CallOptions = {}): Promise<Uint8Array> {
  const response = await stCallRaw(config, path, options);
  const body = response.body;
  if (response.status >= 400) {
    const text = new TextDecoder().decode(body.slice(0, 300)).trim();
    throw new Error(`SillyTavern answered ${response.status}${text ? `: ${text}` : ""} (${path.split("?")[0]})`);
  }
  return body;
}

async function callJson(config: StConfig, path: string, options: CallOptions = {}): Promise<unknown> {
  const body = await call(config, path, options);
  const text = new TextDecoder().decode(body);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`SillyTavern sent something unexpected for ${path}.`);
  }
}

// ── Characters ─────────────────────────────────────────────────────────────────────────────────

export async function stListCharacters(config: StConfig): Promise<StCharacter[]> {
  return parseStCharacters(await callJson(config, "/api/characters/all"));
}

/** A small preview picture (SillyTavern keeps thumbnails); null if there's none. */
export async function stThumbnail(config: StConfig, type: "avatar" | "persona", file: string): Promise<Uint8Array | null> {
  try {
    return await call(config, `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`, { method: "GET" });
  } catch {
    return null;
  }
}

/** The character exactly as SillyTavern exports it: a PNG card. */
export async function stExportCharacterPng(config: StConfig, avatar: string): Promise<Uint8Array> {
  return call(config, "/api/characters/export", { json: { avatar_url: avatar, format: "png" } });
}

/** Reads a PNG card into the editor's form (leniently, like opening a file — a card SillyTavern
 * accepts should open here too). */
export function cardFromPng(bytes: Uint8Array): NormalizedCard {
  const json = extractCardJson(bytes);
  if (!json) throw new Error("SillyTavern sent a picture without a character card in it.");
  try {
    return parseCardJson(json);
  } catch (err) {
    const recovered = err instanceof CardParseError && err.issues ? parseCardJsonLeniently(json, err.issues) : null;
    if (!recovered) throw err;
    return recovered;
  }
}

/** Imports a card into SillyTavern. With `replace` (a character's file name) it overwrites that
 * character — SillyTavern's own "Replace / Update": chats stay, since they belong to the file name.
 * Returns the character's file name. */
export async function stImportCharacter(
  config: StConfig,
  file: { bytes: Uint8Array; format: "png" | "json" },
  replace?: string,
): Promise<string> {
  const result = (await callJson(config, "/api/characters/import", {
    file: { fileName: `card.${file.format}`, bytes: file.bytes },
    fields: { file_type: file.format, ...(replace ? { preserved_name: replace } : {}) },
  })) as { file_name?: string; error?: boolean } | null;
  if (!result || result.error || !result.file_name) throw new Error("SillyTavern could not import the card.");
  return result.file_name.endsWith(".png") ? result.file_name : `${result.file_name}.png`;
}

/** Merges fields back into a stored character (SillyTavern's own way to set the favourite star). */
export async function stMergeAttributes(config: StConfig, attributes: Record<string, unknown>): Promise<void> {
  await call(config, "/api/characters/merge-attributes", { json: attributes });
}

export async function stDuplicateCharacter(config: StConfig, avatar: string): Promise<void> {
  await call(config, "/api/characters/duplicate", { json: { avatar_url: avatar } });
}

export async function stDeleteCharacter(config: StConfig, avatar: string, deleteChats: boolean): Promise<void> {
  await call(config, "/api/characters/delete", { json: { avatar_url: avatar, delete_chats: deleteChats } });
}

// ── Groups ─────────────────────────────────────────────────────────────────────────────────────

export async function stListGroups(config: StConfig): Promise<StGroup[]> {
  return parseStGroups(await callJson(config, "/api/groups/all"));
}

/** A new group; the members' order is the order of first messages in a group chat. */
export async function stCreateGroup(config: StConfig, name: string, members: string[]): Promise<void> {
  await call(config, "/api/groups/create", { json: { name, members } });
}

/** Deletes the group and, like SillyTavern itself does, its group chats. */
export async function stDeleteGroup(config: StConfig, id: string): Promise<void> {
  await call(config, "/api/groups/delete", { json: { id } });
}

// ── Lorebooks (World Info) ─────────────────────────────────────────────────────────────────────

/** The World Info files in SillyTavern, by file name without ".json" (what /edit and /get take). */
export async function stListWorlds(config: StConfig): Promise<string[]> {
  const raw = await callJson(config, "/api/worldinfo/list");
  return Array.isArray(raw)
    ? raw.map((w) => (w && typeof w === "object" ? String((w as Record<string, unknown>).file_id ?? "") : "")).filter(Boolean)
    : [];
}

export async function stGetWorld(config: StConfig, name: string): Promise<Uint8Array> {
  return call(config, "/api/worldinfo/get", { json: { name } });
}

/** Writes a World Info file — over one of the same name, if there is one. */
export async function stSaveWorld(config: StConfig, name: string, data: Record<string, unknown>): Promise<void> {
  await call(config, "/api/worldinfo/edit", { json: { name, data } });
}

// ── Personas ───────────────────────────────────────────────────────────────────────────────────

async function stSettings(config: StConfig): Promise<Record<string, unknown>> {
  return parseStSettings(await callJson(config, "/api/settings/get"));
}

export async function stListPersonas(config: StConfig): Promise<StPersona[]> {
  return personasFromSettings(await stSettings(config));
}

/** Sends a persona: its picture to "User Avatars" (replacing `replace`'s picture if given), then its
 * name and description into SillyTavern's settings. SillyTavern can only save its settings as a
 * whole, so a settings snapshot is made first — restorable in SillyTavern under User Settings →
 * "Settings Snapshots". Returns the persona's file name. */
export async function stSendPersona(
  config: StConfig,
  persona: { name: string; description: string; avatarPng: Uint8Array | null },
  replace?: string,
): Promise<string> {
  const picture = persona.avatarPng ?? (await call(config, "/img/user-default.png", { method: "GET" }));
  const uploaded = (await callJson(config, "/api/avatars/upload", {
    file: { fileName: "persona.png", bytes: picture },
    fields: replace ? { overwrite_name: replace } : {},
  })) as { path?: string } | null;
  const avatar = uploaded?.path;
  if (!avatar) throw new Error("SillyTavern did not take the persona's picture.");
  await call(config, "/api/settings/make-snapshot");
  const settings = await stSettings(config);
  await call(config, "/api/settings/save", { json: withPersona(settings, avatar, persona.name, persona.description) });
  return avatar;
}

/** The persona's picture as SillyTavern stores it. */
export async function stPersonaPicture(config: StConfig, avatar: string): Promise<Uint8Array | null> {
  try {
    return await call(config, `/User Avatars/${encodeURIComponent(avatar)}`, { method: "GET" });
  } catch {
    return null;
  }
}
