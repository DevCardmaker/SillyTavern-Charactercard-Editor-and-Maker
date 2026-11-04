import { z } from "zod";
import type { AiCharacterSummary, AiChatMessage } from "./aiPrompt";
import type { NormalizedCard } from "./normalize";
import { promptText } from "./promptTexts";
import type { FieldLength, OpeningPov } from "./writingOptions";

/** A shared opening for a group chat. SillyTavern always shows one first message per member, so a
 * shared scene has to be one scene cut into one message per character, written in one go so the
 * messages follow from each other. Each part becomes that card's group greeting. */

const aiGroupSceneSchema = z.object({
  messages: z.array(z.object({ character: z.string(), text: z.string() })),
});
export type AiGroupSceneMessage = z.infer<typeof aiGroupSceneSchema>["messages"][number];

export function aiGroupSceneToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiGroupSceneSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiGroupScene(
  raw: unknown,
): { success: true; data: AiGroupSceneMessage[] } | { success: false; error: string } {
  const result = aiGroupSceneSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data.messages } : { success: false, error: result.error.message };
}

const AMOUNTS: Record<FieldLength, string> = { short: "50 words", medium: "100 words", long: "200 words" };
const POV_PROMPTS = { first: "pov_first", second: "pov_second", third: "pov_third" } as const;

export function buildGroupSceneSystemPrompt(length: FieldLength, pov: OpeningPov | ""): string {
  return [
    promptText("group_scene"),
    promptText("field_length", { field: "Each message", amount: AMOUNTS[length] }),
    pov ? promptText(POV_PROMPTS[pov]) : "",
    'Respond only with a JSON object of the form { "messages": [{ "character": "...", "text": "..." }] }.',
    "- messages: exactly one for each character, in the order given",
    "- character: the name exactly as given",
    "- text: only what appears in the chat, without the name in front",
    'Never use the straight double-quote character (") inside the text: use “curly” or ‘single’ quotes for speech.',
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildGroupSceneUserTurn(
  characters: AiCharacterSummary[],
  situation: string,
  persona?: { name: string; description: string },
): AiChatMessage {
  const parts = [`Characters, in the order they speak:\n${JSON.stringify(characters, null, 2)}`];
  if (persona) parts.push(`{{user}} is ${persona.name}: ${persona.description}`);
  parts.push(`What happens: ${situation.trim()}`);
  return { role: "user", content: parts.join("\n\n") };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What models get wrong despite the prompt: the speaker's name in front of the text, and the
 * persona's name instead of the macro, which would stop the greeting working with other personas. */
function cleanSceneText(text: string, speaker: string, personaName?: string): string {
  let clean = text.trim().replace(new RegExp(`^\\**${escapeRegExp(speaker)}\\**\\s*:\\**\\s*`, "iu"), "");
  if (personaName?.trim()) {
    clean = clean.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(personaName.trim())}(?![\\p{L}\\p{N}])`, "gu"), "{{user}}");
  }
  return clean;
}

export interface SceneResult {
  /** One text per speaker, in the same order; empty if the model left them out. */
  texts: string[];
  /** Speakers the model wrote nothing for. */
  missing: string[];
}

/** Sorts a reply onto the speakers by name, not by position: a model that swaps two characters
 * would otherwise put words in the wrong mouth. A longer name ("Lena Schmidt" for "Lena") counts. */
export function resolveGroupScene(speakers: string[], messages: AiGroupSceneMessage[], personaName?: string): SceneResult {
  const key = (name: string) => name.trim().toLowerCase();
  const texts = speakers.map(() => "");
  for (const message of messages) {
    const name = key(message.character);
    let index = speakers.findIndex((s) => key(s) === name);
    if (index < 0) index = speakers.findIndex((s) => key(s) && name.split(/\s+/).includes(key(s)));
    if (index < 0) continue;
    const text = cleanSceneText(message.text, speakers[index], personaName);
    if (text) texts[index] = texts[index] ? `${texts[index]}\n\n${text}` : text;
  }
  return { texts, missing: speakers.filter((_, i) => !texts[i]) };
}

const ORDER_NOTE = "Group chat order in SillyTavern, top to bottom:";

/** What goes into one card: the greeting, and in the Creator's Notes the order the scene was written
 * for, because that's set in SillyTavern's member list and a card can't carry it. An earlier note
 * is replaced, so writing a new scene doesn't pile them up. */
export function groupScenePatch(
  card: NormalizedCard,
  text: string,
  order: string[],
  replace: boolean,
): Pick<NormalizedCard, "group_only_greetings" | "creator_notes"> {
  const kept = replace ? [] : (card.group_only_greetings ?? []).filter((g) => g.trim());
  const note = `${ORDER_NOTE} ${order.join(", ")}. New members are added at the top, the arrows move them. Needs the Group Greetings extension.`;
  const notes = card.creator_notes
    .split("\n")
    .filter((line) => !line.startsWith(ORDER_NOTE))
    .join("\n")
    .trimEnd();
  return {
    group_only_greetings: [...kept, text],
    creator_notes: notes ? `${notes}\n\n${note}` : note,
  };
}
