import { invoke } from "@tauri-apps/api/core";
import { type AiFieldKey, type AiFieldPatch, aiFieldsToJsonSchema, parseAiPatch } from "../schema/aiAssist";
import { type AiConsistencyFinding, aiConsistencyCheckToJsonSchema, parseAiConsistencyCheck } from "../schema/aiConsistencyCheck";
import { type AiGroupMemberDraft, aiGroupToJsonSchema, parseAiGroup } from "../schema/aiGroupGenerate";
import { aiImagePromptToJsonSchema, parseAiImagePrompt } from "../schema/aiImagePrompt";
import { type AiLorebookEntryDraft, aiLorebookEntriesToJsonSchema, parseAiLorebookEntries } from "../schema/aiLorebookAssist";
import type { AiChatMessage } from "../schema/aiPrompt";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function callChatCompletion(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  jsonSchema: { name: string; strict: boolean; schema: Record<string, unknown> },
): Promise<string> {
  const result = await invoke<{ content: string }>("ai_chat_completion", {
    req: {
      base_url: config.baseUrl.trim().replace(/\/+$/, ""),
      api_key: config.apiKey || null,
      model: config.model,
      messages,
      json_schema: jsonSchema,
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
