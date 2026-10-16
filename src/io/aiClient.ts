import { invoke } from "@tauri-apps/api/core";
import { type AiFieldKey, type AiFieldPatch, aiFieldsToJsonSchema, parseAiPatch } from "../schema/aiAssist";
import { type AiConsistencyFinding, aiConsistencyCheckToJsonSchema, parseAiConsistencyCheck } from "../schema/aiConsistencyCheck";
import { type AiConsistencyFix, aiConsistencyFixToJsonSchema, parseAiConsistencyFix } from "../schema/aiConsistencyFix";
import { type AiGroupMemberDraft, aiGroupToJsonSchema, parseAiGroup } from "../schema/aiGroupGenerate";
import { type AiIntegration, aiIntegrateToJsonSchema, parseAiIntegration } from "../schema/aiIntegrateMembers";
import {
  type AiSplitMember,
  type AiSplitPerson,
  aiSplitMemberToJsonSchema,
  aiSplitPeopleToJsonSchema,
  parseAiSplitMember,
  parseAiSplitPeople,
} from "../schema/aiSplitGroup";
import {
  type AiStoryNote,
  type AiStoryPerson,
  aiStoryNotesToJsonSchema,
  aiStoryPeopleToJsonSchema,
  parseAiStoryNotes,
  parseAiStoryPeople,
} from "../schema/storyToCards";
import {
  type AiStoryLoreThing,
  aiStoryLoreEntryToJsonSchema,
  aiStoryLoreToJsonSchema,
  parseAiStoryLore,
  parseAiStoryLoreEntry,
} from "../schema/storyLore";
import {
  type AiKeysTranslation,
  aiKeysTranslationToJsonSchema,
  aiNameToJsonSchema,
  parseAiName,
  aiTranslationToJsonSchema,
  parseAiKeysTranslation,
  parseAiTranslation,
} from "../schema/translateCard";
import { aiImagePromptToJsonSchema, parseAiImagePrompt } from "../schema/aiImagePrompt";
import { type AiRelocateMember, aiRelocateToJsonSchema, parseAiRelocate } from "../schema/aiRelocate";
import { type AiLorebookEntryDraft, aiLorebookEntriesToJsonSchema, parseAiLorebookEntries } from "../schema/aiLorebookAssist";
import { type AiLorebookEditEntry, aiLorebookEditToJsonSchema, parseAiLorebookEdit } from "../schema/aiLorebookEdit";
import type { AiChatMessage } from "../schema/aiPrompt";
import { usePromptFileStore } from "../state/promptFileStore";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Send several requests at once in bulk operations (see io/concurrency.ts) — for cloud APIs. */
  parallel?: boolean;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function callChatCompletion(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> } | null,
  options: { maxTokens?: number; stop?: string[]; temperature?: number } = {},
): Promise<string> {
  usePromptFileStore.getState().setLastMessages(messages);
  const result = await invoke<{ content: string }>("ai_chat_completion", {
    req: {
      base_url: config.baseUrl.trim().replace(/\/+$/, ""),
      api_key: config.apiKey || null,
      model: config.model,
      messages,
      json_schema: jsonSchema,
      temperature: options.temperature ?? config.temperature ?? null,
      max_tokens: options.maxTokens ?? config.maxTokens ?? null,
      stop: options.stop ?? null,
    },
  });
  return result.content;
}

/** Sends one turn to the configured LLM and validates its reply against the selected fields'
 * schema. Never returns a value that doesn't match the schema — throws a plain `Error` with a
 * message safe to show via the app's existing `onError` banner instead. */
export async function requestFieldPatch(
  config: AiProviderConfig,
  selected: readonly AiFieldKey[],
  messages: AiChatMessage[],
): Promise<AiFieldPatch> {
  const content = await callChatCompletion(config, messages, {
    name: "card_fields",
    strict: true,
    schema: aiFieldsToJsonSchema(selected),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiPatch(selected, raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Sends one turn to the configured LLM and validates its reply as a list of proposed lorebook
 * entries. Same validate-or-throw contract as `requestFieldPatch`. */
export async function requestLorebookEntries(
  config: AiProviderConfig,
  messages: AiChatMessage[],
): Promise<AiLorebookEntryDraft[]> {
  const content = await callChatCompletion(config, messages, {
    name: "lorebook_entries",
    strict: true,
    schema: aiLorebookEntriesToJsonSchema(),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiLorebookEntries(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Sends one "fill / revise entries" turn and validates the reply against exactly the entry
 * indices that were sent (see `parseAiLorebookEdit`). Same validate-or-throw contract as
 * `requestFieldPatch`. */
export async function requestLorebookEdit(
  config: AiProviderConfig,
  indices: readonly number[],
  messages: AiChatMessage[],
): Promise<AiLorebookEditEntry[]> {
  const content = await callChatCompletion(config, messages, {
    name: "lorebook_edit",
    strict: true,
    schema: aiLorebookEditToJsonSchema(indices.length),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiLorebookEdit(indices, raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Sends one turn to the configured LLM and returns the validated image prompt string. Same
 * validate-or-throw contract as `requestFieldPatch`. */
export async function requestImagePrompt(config: AiProviderConfig, messages: AiChatMessage[]): Promise<string> {
  const content = await callChatCompletion(config, messages, {
    name: "image_prompt",
    strict: true,
    schema: aiImagePromptToJsonSchema(),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiImagePrompt(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Sends one turn to the configured LLM and validates its reply as a list of consistency findings
 * across several characters. Same validate-or-throw contract as `requestFieldPatch`; an empty
 * array is a valid, normal result ("no contradictions found"), not an error. */
export async function requestConsistencyCheck(
  config: AiProviderConfig,
  messages: AiChatMessage[],
): Promise<AiConsistencyFinding[]> {
  const content = await callChatCompletion(config, messages, {
    name: "consistency_check",
    strict: true,
    schema: aiConsistencyCheckToJsonSchema(),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiConsistencyCheck(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Asks for a fix of one consistency finding as find/replace edits. Same validate-or-throw contract
 * as `requestFieldPatch`; whether the quoted passages exist is checked by the caller. */
export async function requestConsistencyFix(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiConsistencyFix> {
  const content = await callChatCompletion(config, messages, {
    name: "consistency_fix",
    strict: true,
    schema: aiConsistencyFixToJsonSchema(),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiConsistencyFix(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Asks for additions that work newly generated characters into the reference cards. Same
 * validate-or-throw contract as `requestFieldPatch`; positions are resolved by the caller. */
export async function requestIntegration(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiIntegration> {
  const content = await callChatCompletion(config, messages, {
    name: "integrate_members",
    strict: true,
    schema: aiIntegrateToJsonSchema(),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiIntegration(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Split pass 1: the people a group card (and its lorebook) describes. */
export async function requestSplitPeople(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiSplitPerson[]> {
  const content = await callChatCompletion(config, messages, {
    name: "split_people",
    strict: true,
    schema: aiSplitPeopleToJsonSchema(),
  });
  return parseOrThrow(content, parseAiSplitPeople);
}

/** Split pass 2: one person's card. Copying a person's part of a long group card word for word
 * needs room — a cut-off reply is invalid JSON — hence the raised token limit. */
export async function requestSplitMember(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiSplitMember> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "split_member", strict: true, schema: aiSplitMemberToJsonSchema() },
    { maxTokens: Math.max(config.maxTokens ?? 0, 4096) },
  );
  return parseOrThrow(content, parseAiSplitMember);
}

/** One translated chunk. Some languages need far more tokens than English for the same text, hence
 * the raised limit; the low temperature keeps the model from rewriting structure (live test at 0.9:
 * a W++ block came back as prose — at 0.3 it stayed W++). */
const TRANSLATE_TEMPERATURE = 0.3;

export async function requestTranslation(config: AiProviderConfig, messages: AiChatMessage[]): Promise<string> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "translation", strict: true, schema: aiTranslationToJsonSchema() },
    { maxTokens: Math.max(config.maxTokens ?? 0, 2048), temperature: TRANSLATE_TEMPERATURE },
  );
  return parseOrThrow(content, parseAiTranslation);
}

export async function requestNameTranslation(config: AiProviderConfig, messages: AiChatMessage[]): Promise<string> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "name_translation", strict: true, schema: aiNameToJsonSchema() },
    { temperature: TRANSLATE_TEMPERATURE },
  );
  return parseOrThrow(content, parseAiName);
}

export async function requestKeysTranslation(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiKeysTranslation> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "keys_translation", strict: true, schema: aiKeysTranslationToJsonSchema() },
    { temperature: TRANSLATE_TEMPERATURE },
  );
  return parseOrThrow(content, parseAiKeysTranslation);
}

/** Cards from a story, pass 1: the people in one part of the story. */
export async function requestStoryPeople(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiStoryPerson[]> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "story_people", strict: true, schema: aiStoryPeopleToJsonSchema() },
    { maxTokens: Math.max(config.maxTokens ?? 0, 2048) },
  );
  return parseOrThrow(content, parseAiStoryPeople);
}

/** Cards from a story, pass 2: notes on one person from one batch of passages. */
export async function requestStoryNotes(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiStoryNote[]> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "story_notes", strict: true, schema: aiStoryNotesToJsonSchema() },
    { maxTokens: Math.max(config.maxTokens ?? 0, 2048) },
  );
  return parseOrThrow(content, parseAiStoryNotes);
}

/** Story lorebook, step 1: the places, groups and terms in one part of the story. */
export async function requestStoryLore(config: AiProviderConfig, messages: AiChatMessage[]): Promise<AiStoryLoreThing[]> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "story_lore", strict: true, schema: aiStoryLoreToJsonSchema() },
    { maxTokens: Math.max(config.maxTokens ?? 0, 2048) },
  );
  return parseOrThrow(content, parseAiStoryLore);
}

/** Story lorebook, step 2: one entry's text. */
export async function requestStoryLoreEntry(config: AiProviderConfig, messages: AiChatMessage[]): Promise<string> {
  const content = await callChatCompletion(
    config,
    messages,
    { name: "story_lore_entry", strict: true, schema: aiStoryLoreEntryToJsonSchema() },
    // Low and fixed, like translation: at the profile's 0.7 the model filled gaps with what it knew
    // of a famous story ("London, 8.9 million people", a coachman invented for Mrs. Hudson).
    { maxTokens: Math.max(config.maxTokens ?? 0, 1024), temperature: TRANSLATE_TEMPERATURE },
  );
  return parseOrThrow(content, parseAiStoryLoreEntry);
}

function parseOrThrow<T>(content: string, parse: (raw: unknown) => { success: true; data: T } | { success: false; error: string }): T {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON (maybe cut off — try again): ${truncate(content)}`);
  }
  const parsed = parse(raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }
  return parsed.data;
}

/** Sends one turn to the configured LLM and validates its reply as exactly `count` new group
 * members. Same validate-or-throw contract as `requestFieldPatch`. */
export async function requestGroupGenerate(
  config: AiProviderConfig,
  count: number,
  messages: AiChatMessage[],
): Promise<AiGroupMemberDraft[]> {
  const content = await callChatCompletion(config, messages, {
    name: "group_characters",
    strict: true,
    schema: aiGroupToJsonSchema(count),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiGroup(count, raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** Sends one turn to the configured LLM and validates its reply as exactly `count` relocated
 * members (name + updated scenario). Same validate-or-throw contract as `requestFieldPatch`. */
export async function requestRelocate(
  config: AiProviderConfig,
  count: number,
  messages: AiChatMessage[],
): Promise<AiRelocateMember[]> {
  const content = await callChatCompletion(config, messages, {
    name: "relocated_characters",
    strict: true,
    schema: aiRelocateToJsonSchema(count),
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Model response was not valid JSON: ${truncate(content)}`);
  }

  const parsed = parseAiRelocate(count, raw);
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected format: ${parsed.error}`);
  }

  return parsed.data;
}

/** One free-text chat reply (the test chat) — no JSON schema. `maxTokens` overrides the profile's
 * value, which is sized for writing whole cards rather than a single roleplay reply. */
export async function requestChatReply(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  options: { maxTokens: number; stop: string[] },
): Promise<string> {
  return callChatCompletion(config, messages, null, options);
}

/** Minimal connectivity/auth smoke test: asks for a tiny schema-constrained reply and returns
 * whatever text came back. Exercises the exact same request path as `requestFieldPatch` (same
 * Rust command, same response_format handling), just with a trivial payload so it finishes in
 * seconds instead of minutes on a slow local model. */
export async function testConnection(config: AiProviderConfig): Promise<string> {
  return callChatCompletion(
    config,
    [{ role: "user", content: 'Respond only with the JSON object {"ok": true}.' }],
    {
      name: "ping",
      strict: true,
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  );
}
