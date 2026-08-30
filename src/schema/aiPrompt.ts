import { type AiFieldKey, aiFieldLabel, type AiFieldPatch } from "./aiAssist";
import { type AiImageArtStyle, type AiImageModelStyle, imageArtStyleGuidance, imageModelStyleGuidance } from "./aiImagePrompt";
import type { AiLorebookEntryDraft } from "./aiLorebookAssist";
import type { NormalizedCard } from "./normalize";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Static instructions for the current turn — only mentions the fields the user actually
 * selected, so the model isn't tempted to invent content for fields it wasn't asked about. */
export function buildSystemPrompt(selected: readonly AiFieldKey[]): string {
  const fieldList = selected.map((key) => `- ${key}: ${aiFieldLabel(key)}`).join("\n");
  return [
    "You help fill in or revise a SillyTavern character card.",
    "Respond only with a JSON object containing exactly the following fields:",
    fieldList,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "The current draft state and the user's instruction follow in the next message.",
  ].join("\n");
}

/** Serializes the current draft + the user's free-text instruction into one user message.
 * Each turn resends the full current draft rather than a growing chat transcript, so context
 * length depends on field count, not on how many refinement rounds have happened. */
export function buildUserTurn(instruction: string, draftValues: AiFieldPatch): AiChatMessage {
  const draftJson = JSON.stringify(draftValues, null, 2);
  return {
    role: "user",
    content: `Current draft:\n${draftJson}\n\nInstruction: ${instruction}`,
  };
}

/** Static instructions for a lorebook-entry-generation turn. Unlike the card-field prompt, the
 * model here proposes *new* entries to add to an existing lorebook, not values to overwrite. */
export function buildLorebookSystemPrompt(): string {
  return [
    "You help propose lorebook entries (World Info) for a SillyTavern character card.",
    'Respond only with a JSON object of the form { "entries": [...] }.',
    "Each entry has:",
    "- keys: a list of keywords that should trigger this entry in chat",
    "- content: the actual background text (e.g. a description of a person, place, or event)",
    "- comment: optional, a short human-readable label for the entry (e.g. \"Mother Elara\")",
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "The current draft state (entries already proposed but not yet added) and the user's instruction follow in the next message.",
  ].join("\n");
}

/** Same resend-full-state pattern as `buildUserTurn`: each turn gets the complete current list
 * of proposed (not-yet-added) entries plus the new instruction, and returns the complete updated
 * list — avoids ambiguity about whether a follow-up instruction means "add" or "replace". */
export function buildLorebookUserTurn(instruction: string, draftEntries: AiLorebookEntryDraft[]): AiChatMessage {
  const draftJson = JSON.stringify(draftEntries, null, 2);
  return {
    role: "user",
    content: `Currently proposed entries:\n${draftJson}\n\nInstruction: ${instruction}`,
  };
}

/** Static instructions for a single image-prompt-generation turn. The model-specific prompt
 * style (natural language vs. tag list vs. Pony's score-tag convention) is hardcoded knowledge
 * (see `imageModelStyleGuidance`), not something the LLM should have to infer. */
export function buildImagePromptSystemPrompt(modelStyle: AiImageModelStyle, artStyle: AiImageArtStyle): string {
  return [
    "You create a single image-generation prompt for a SillyTavern character's appearance.",
    imageModelStyleGuidance(modelStyle),
    imageArtStyleGuidance(artStyle),
    'Respond only with a JSON object of the form { "prompt": "..." }.',
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "Details about the character and the user's instruction follow in the next message.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Feeds the character's own description/personality/tags as context, plus the user's free-text
 * instruction (pose, mood, framing, …) — the model style itself is handled separately via
 * `buildImagePromptSystemPrompt`, so it isn't repeated here. */
export function buildImagePromptUserTurn(instruction: string, card: NormalizedCard): AiChatMessage {
  const context = JSON.stringify(
    { description: card.description, personality: card.personality, tags: card.tags },
    null,
    2,
  );
  return {
    role: "user",
    content: `Character:\n${context}\n\nInstruction: ${instruction}`,
  };
}

/** The "biographically relevant" subset of a character sent to the consistency check and the
 * group generator — name/description/personality/scenario/first_mes carry the factual claims a
 * contradiction could hide in; system_prompt/post_history_instructions are meta-instructions to
 * the model, not claims about the character, so they're deliberately left out of both. */
export interface AiCharacterSummary {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
}

export function summarizeCardForAi(card: NormalizedCard): AiCharacterSummary {
  const { name, description, personality, scenario, first_mes } = card;
  return { name, description, personality, scenario, first_mes };
}

/** Static instructions for a cross-character consistency check. Explicitly told not to invent
 * problems — an empty `findings` list is a normal, expected result, not a fallback. */
export function buildConsistencyCheckSystemPrompt(): string {
  return [
    "You check several SillyTavern character cards meant to be used together as a group (e.g. a family or class) for contradictions.",
    "Examples: mismatched ages (e.g. a child older than a parent), contradictory family or relationship claims, name conflicts, contradictory timeline or location details in the backstory.",
    'Respond only with a JSON object of the form { "findings": [...] }.',
    "Each finding has:",
    "- characters: a list of the affected character names, exactly as given in their name field",
    "- issue: a short description of the contradiction",
    'If nothing stands out, respond with { "findings": [] } — do not invent problems.',
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

export function buildConsistencyCheckUserTurn(characters: AiCharacterSummary[], instruction: string): AiChatMessage {
  const payload = JSON.stringify(characters, null, 2);
  const trimmed = instruction.trim();
  return {
    role: "user",
    content: trimmed ? `Characters:\n${payload}\n\nAdditional note: ${trimmed}` : `Characters:\n${payload}`,
  };
}

/** Static instructions for generating an entire group of new characters at once. Explicitly told
 * to keep the members consistent with each other — the whole point of generating them together
 * instead of one at a time via `AiAssistPanel`. */
export function buildGroupGenerateSystemPrompt(count: number): string {
  return [
    `You create ${count} new, related SillyTavern characters at once (e.g. a family or class).`,
    "Keep the characters consistent with each other: plausible age gaps, consistent surnames/family or relationship claims, no contradictions between members.",
    `Respond only with a JSON object of the form { "characters": [...] } with exactly ${count} entries.`,
    "Each entry has: name, description, personality, scenario, first_mes.",
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

export function buildGroupGenerateUserTurn(instruction: string): AiChatMessage {
  return { role: "user", content: `Instruction: ${instruction}` };
}
