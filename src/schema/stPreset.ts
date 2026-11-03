/** SillyTavern Chat Completion presets (the JSON files in `OpenAI Settings`).
 *
 * A preset holds far more than this editor shows — samplers, regex scripts, extension data, fields
 * from newer SillyTavern versions. So there is deliberately no schema that picks out known fields:
 * the parsed object is kept as it is and every edit below changes only the one thing it is about.
 * Everything else reaches the saved file untouched. */

export interface StPresetPrompt extends Record<string, unknown> {
  identifier?: string;
  name?: string;
  role?: string;
  content?: string;
  system_prompt?: boolean;
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
}

export interface StPromptOrderEntry extends Record<string, unknown> {
  identifier: string;
  enabled: boolean;
}

export interface StPromptOrderSet extends Record<string, unknown> {
  character_id?: number | string;
  order: StPromptOrderEntry[];
}

export interface StPreset extends Record<string, unknown> {
  prompts: StPresetPrompt[];
  prompt_order: StPromptOrderSet[];
}

/** The order set SillyTavern uses for Chat Completion (`dummyId` in its openai.js). */
const ACTIVE_ORDER_ID = "100001";

/** Injection position "in chat, at a depth"; the other value (0) means "at its place in the list". */
export const INJECTION_IN_CHAT = 1;

/** Filled in by SillyTavern from the card, persona or lorebook; these can still be switched off. */
const TOGGLEABLE_MARKERS = new Set([
  "charDescription",
  "charPersonality",
  "scenario",
  "personaDescription",
  "worldInfoBefore",
  "worldInfoAfter",
  "main",
  "chatHistory",
  "dialogueExamples",
]);

/** The built-in prompts SillyTavern sends although they have `system_prompt: true`. */
const BUILT_IN_PROMPTS = new Set(["main", "nsfw", "jailbreak", "enhanceDefinitions"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Throws a readable error if the text isn't a Chat Completion preset. */
export function parseStPreset(text: string): StPreset {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const validOrder =
    isObject(data) &&
    Array.isArray(data.prompt_order) &&
    data.prompt_order.every(
      (set) =>
        isObject(set) &&
        Array.isArray(set.order) &&
        set.order.every((entry) => isObject(entry) && typeof entry.identifier === "string"),
    );
  if (!isObject(data) || !Array.isArray(data.prompts) || !data.prompts.every(isObject) || !validOrder) {
    throw new Error(
      "This is not a Chat Completion preset. Only presets from the Chat Completion API with a prompt list can be edited here.",
    );
  }
  return data as StPreset;
}

/** Same formatting as SillyTavern's own preset files. */
export function serializeStPreset(preset: StPreset): string {
  return JSON.stringify(preset, null, 4);
}

/** Position of the order set this editor works on: SillyTavern's, or the first one in an unusual file. */
function activeOrderPosition(preset: StPreset): number {
  const index = preset.prompt_order.findIndex((set) => String(set.character_id) === ACTIVE_ORDER_ID);
  return index >= 0 ? index : preset.prompt_order.length > 0 ? 0 : -1;
}

/** True if SillyTavern would not use the shown list: the file has no order set for Chat Completion. */
export function usesFallbackOrder(preset: StPreset): boolean {
  return !preset.prompt_order.some((set) => String(set.character_id) === ACTIVE_ORDER_ID);
}

function withOrder(preset: StPreset, change: (order: StPromptOrderEntry[]) => StPromptOrderEntry[]): StPreset {
  const position = activeOrderPosition(preset);
  if (position < 0) {
    return { ...preset, prompt_order: [{ character_id: Number(ACTIVE_ORDER_ID), order: change([]) }] };
  }
  return {
    ...preset,
    prompt_order: preset.prompt_order.map((set, i) => (i === position ? { ...set, order: change(set.order) } : set)),
  };
}

/** If two prompts share an identifier, SillyTavern's lookup finds the first — so does this. */
export function findPrompt(preset: StPreset, identifier: string): StPresetPrompt | undefined {
  return preset.prompts.find((prompt) => prompt.identifier === identifier);
}

export interface PromptRow {
  /** Position in the order list, which is also the row's stable address for edits. */
  position: number;
  identifier: string;
  enabled: boolean;
  /** Missing if the order refers to a prompt the file doesn't contain. */
  prompt?: StPresetPrompt;
}

export function listPromptRows(preset: StPreset): PromptRow[] {
  const position = activeOrderPosition(preset);
  if (position < 0) return [];
  return preset.prompt_order[position].order.map((entry, i) => ({
    position: i,
    identifier: entry.identifier,
    enabled: entry.enabled === true,
    prompt: findPrompt(preset, entry.identifier),
  }));
}

/** Prompts the file contains but the order list doesn't mention: SillyTavern doesn't send them. */
export function listUnplacedPrompts(preset: StPreset): StPresetPrompt[] {
  const placed = new Set(listPromptRows(preset).map((row) => row.identifier));
  return preset.prompts.filter((prompt) => typeof prompt.identifier === "string" && !placed.has(prompt.identifier));
}

export const promptLabel = (prompt: StPresetPrompt | undefined, identifier: string): string =>
  prompt?.name?.trim() || identifier;

export const canEditPrompt = (prompt: StPresetPrompt): boolean => !prompt.marker;

export const canTogglePrompt = (prompt: StPresetPrompt | undefined): boolean =>
  !!prompt && (!prompt.marker || TOGGLEABLE_MARKERS.has(prompt.identifier ?? ""));

export const canDeletePrompt = (prompt: StPresetPrompt): boolean => prompt.system_prompt === false;

/** A prompt in its list position with `system_prompt: true` and an identifier SillyTavern doesn't
 * know is never sent, although it looks switched on — and nothing in SillyTavern says so. */
export function isSilentlyIgnored(prompt: StPresetPrompt): boolean {
  return (
    prompt.system_prompt === true &&
    !prompt.marker &&
    prompt.injection_position !== INJECTION_IN_CHAT &&
    !BUILT_IN_PROMPTS.has(prompt.identifier ?? "")
  );
}

export function promptWarning(row: PromptRow): string | undefined {
  if (!row.prompt) return "The prompt list refers to a prompt this file doesn't contain";
  if (isSilentlyIgnored(row.prompt)) return "SillyTavern never sends this prompt: it's marked as a system prompt";
  // SillyTavern's own prompts are empty on purpose in many presets, e.g. Post-History Instructions.
  const isOwnPrompt = !row.prompt.marker && !BUILT_IN_PROMPTS.has(row.identifier);
  if (row.enabled && isOwnPrompt && !row.prompt.content?.trim()) return "Switched on, but empty";
  return undefined;
}

export function setPromptEnabled(preset: StPreset, position: number, enabled: boolean): StPreset {
  return withOrder(preset, (order) => order.map((entry, i) => (i === position ? { ...entry, enabled } : entry)));
}

/** Moves a row; a target outside the list goes to the nearest end. */
export function movePrompt(preset: StPreset, from: number, to: number): StPreset {
  return withOrder(preset, (order) => {
    if (from < 0 || from >= order.length) return order;
    const target = Math.min(Math.max(Math.trunc(to), 0), order.length - 1);
    const next = [...order];
    const [entry] = next.splice(from, 1);
    next.splice(target, 0, entry);
    return next;
  });
}

export function updatePrompt(preset: StPreset, identifier: string, patch: Partial<StPresetPrompt>): StPreset {
  const index = preset.prompts.findIndex((prompt) => prompt.identifier === identifier);
  if (index < 0) return preset;
  return { ...preset, prompts: preset.prompts.map((prompt, i) => (i === index ? { ...prompt, ...patch } : prompt)) };
}

/** A new prompt, switched on, right below `afterPosition` (at the top with -1). Marked with
 * `system_prompt: false` — see `isSilentlyIgnored`. */
export function addPrompt(preset: StPreset, afterPosition: number, identifier: string): StPreset {
  const prompt: StPresetPrompt = {
    identifier,
    name: "New prompt",
    role: "system",
    content: "",
    system_prompt: false,
    marker: false,
    injection_position: 0,
    injection_depth: 4,
    forbid_overrides: false,
  };
  return placePrompt({ ...preset, prompts: [...preset.prompts, prompt] }, identifier, afterPosition);
}

/** Adds a prompt the file already contains to the list, switched on. */
export function placePrompt(preset: StPreset, identifier: string, afterPosition: number): StPreset {
  return withOrder(preset, (order) => {
    const next = [...order];
    next.splice(afterPosition + 1, 0, { identifier, enabled: true });
    return next;
  });
}

/** Deletes a user prompt and every reference to it, in all order sets. */
export function deletePrompt(preset: StPreset, identifier: string): StPreset {
  const prompt = findPrompt(preset, identifier);
  if (!prompt || !canDeletePrompt(prompt)) return preset;
  return {
    ...preset,
    prompts: preset.prompts.filter((p) => p !== prompt),
    prompt_order: preset.prompt_order.map((set) => ({
      ...set,
      order: set.order.filter((entry) => entry.identifier !== identifier),
    })),
  };
}

/** Removes a list row that points at a prompt the file doesn't contain. */
export function removeRow(preset: StPreset, position: number): StPreset {
  return withOrder(preset, (order) => order.filter((_, i) => i !== position));
}

/** Regex scripts in the preset — not editable here, but the user should see they're kept. */
export function countRegexScripts(preset: StPreset): number {
  const extensions = preset.extensions;
  const scripts = isObject(extensions) ? extensions.regex_scripts : undefined;
  return Array.isArray(scripts) ? scripts.length : 0;
}

/** Text of everything switched on that the preset itself contributes; the markers' text comes from
 * the card and chat. */
export function enabledPromptTexts(preset: StPreset): string[] {
  return listPromptRows(preset)
    .filter((row) => row.enabled && row.prompt && !row.prompt.marker && !isSilentlyIgnored(row.prompt))
    .map((row) => row.prompt?.content ?? "");
}
