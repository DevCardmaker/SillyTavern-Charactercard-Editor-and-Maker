/** Reading SillyTavern's answers and preparing what we send — pure functions, so they're tested
 * without a server. */

export interface StCharacter {
  /** File name in SillyTavern's characters folder — its id for every request ("Anna.png"). */
  avatar: string;
  name: string;
  tags: string[];
  /** Milliseconds since 1970, 0 if never chatted. */
  lastChat: number;
  chatSize: number;
  /** SillyTavern's favourite star. */
  fav: boolean;
  /** The chat SillyTavern opens for this character ("" if none is set). */
  chat: string;
}

export interface StGroup {
  id: string;
  name: string;
  /** Character file names, in SillyTavern's order. */
  members: string[];
  chatCount: number;
}

export interface StPersona {
  /** File name in SillyTavern's "User Avatars" folder — the persona's key. */
  avatar: string;
  name: string;
  description: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/** From POST /api/characters/all. Entries without a file name are useless here and dropped. */
export function parseStCharacters(raw: unknown): StCharacter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const c = asRecord(item);
      const data = asRecord(c.data);
      const tags = Array.isArray(data.tags) ? data.tags : Array.isArray(c.tags) ? c.tags : [];
      return {
        avatar: typeof c.avatar === "string" ? c.avatar : "",
        name: String(c.name ?? data.name ?? "").trim(),
        tags: tags.filter((t): t is string => typeof t === "string"),
        lastChat: toTime(c.date_last_chat),
        chatSize: typeof c.chat_size === "number" ? c.chat_size : 0,
        fav: c.fav === true || c.fav === "true" || asRecord(data.extensions).fav === true,
        chat: typeof c.chat === "string" ? c.chat : "",
      };
    })
    .filter((c) => c.avatar)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** What SillyTavern forgets when a card is imported over a character (it resets the favourite and
 * drops the current chat, even in its own "Replace / Update"), as a body for
 * /api/characters/merge-attributes, which merges it back into the stored card. */
export function keptAttributes(character: Pick<StCharacter, "avatar" | "fav" | "chat">): Record<string, unknown> {
  return {
    avatar: character.avatar,
    fav: character.fav,
    data: { extensions: { fav: character.fav } },
    ...(character.chat ? { chat: character.chat } : {}),
  };
}

/** From POST /api/groups/all. */
export function parseStGroups(raw: unknown): StGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const g = asRecord(item);
      return {
        id: String(g.id ?? ""),
        name: String(g.name ?? "").trim() || "Unnamed group",
        members: Array.isArray(g.members) ? g.members.filter((m): m is string => typeof m === "string") : [],
        chatCount: Array.isArray(g.chats) ? g.chats.length : 0,
      };
    })
    .filter((g) => g.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** SillyTavern's settings as an object. POST /api/settings/get answers with the file's text in
 * `settings`. */
export function parseStSettings(raw: unknown): Record<string, unknown> {
  const text = asRecord(raw).settings;
  if (typeof text !== "string") throw new Error("SillyTavern sent no settings.");
  return asRecord(JSON.parse(text));
}

/** The personas listed in the settings (name per avatar file, description separately). */
export function personasFromSettings(settings: Record<string, unknown>): StPersona[] {
  const power = asRecord(settings.power_user);
  const names = asRecord(power.personas);
  const descriptions = asRecord(power.persona_descriptions);
  return Object.entries(names)
    .filter(([, name]) => typeof name === "string")
    .map(([avatar, name]) => ({
      avatar,
      name: (name as string).trim(),
      description: String(asRecord(descriptions[avatar]).description ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** A copy of the settings with the persona added or updated — everything else untouched. A known
 * persona keeps its other options (position, depth, lorebook …); a new one gets SillyTavern's own
 * defaults for them. */
export function withPersona(
  settings: Record<string, unknown>,
  avatar: string,
  name: string,
  description: string,
): Record<string, unknown> {
  const power = asRecord(settings.power_user);
  const descriptions = asRecord(power.persona_descriptions);
  const existing = asRecord(descriptions[avatar]);
  const entry =
    Object.keys(existing).length > 0
      ? { ...existing, description }
      : { description, position: 0, depth: 2, role: 0, lorebook: "", title: "" };
  return {
    ...settings,
    power_user: {
      ...power,
      personas: { ...asRecord(power.personas), [avatar]: name },
      persona_descriptions: { ...descriptions, [avatar]: entry },
    },
  };
}

const plainName = (name: string) => name.trim().toLocaleLowerCase();

/** Characters in SillyTavern with the same name — candidates for overwriting. */
export function sameNameCharacters(characters: readonly StCharacter[], name: string): StCharacter[] {
  const wanted = plainName(name);
  return wanted ? characters.filter((c) => plainName(c.name) === wanted) : [];
}

export function sameNamePersonas(personas: readonly StPersona[], name: string): StPersona[] {
  const wanted = plainName(name);
  return wanted ? personas.filter((p) => plainName(p.name) === wanted) : [];
}
