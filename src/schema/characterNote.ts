import type { NormalizedCard } from "./normalize";

export type CharacterNoteRole = "system" | "user" | "assistant";

/** SillyTavern's per-character Author's Note ("Character's Note"), stored in the card as
 * `extensions.depth_prompt` — inserted `depth` messages above the latest one with the given role.
 * Defaults are ST's own (depth 4, system). */
export interface CharacterNote {
  prompt: string;
  depth: number;
  role: CharacterNoteRole;
}

export const CHARACTER_NOTE_ROLES: CharacterNoteRole[] = ["system", "user", "assistant"];

export function getCharacterNote(card: NormalizedCard): CharacterNote {
  const raw = (card.extensions?.depth_prompt ?? {}) as Record<string, unknown>;
  const role = CHARACTER_NOTE_ROLES.includes(raw.role as CharacterNoteRole) ? (raw.role as CharacterNoteRole) : "system";
  const depth = Number(raw.depth);
  return {
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    depth: Number.isFinite(depth) && depth >= 0 ? depth : 4,
    role,
  };
}

/** Card patch for changing part of the note — keeps every other extension and any extra fields
 * ST might add to `depth_prompt` later. */
export function characterNotePatch(card: NormalizedCard, patch: Partial<CharacterNote>): Partial<NormalizedCard> {
  const existing = (card.extensions?.depth_prompt ?? {}) as Record<string, unknown>;
  return {
    extensions: { ...card.extensions, depth_prompt: { ...existing, ...getCharacterNote(card), ...patch } },
  };
}
