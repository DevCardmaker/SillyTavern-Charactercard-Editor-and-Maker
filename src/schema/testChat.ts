import type { AiChatMessage } from "./aiPrompt";
import { getCharacterNote } from "./characterNote";
import { type BudgetSettings, DEFAULT_BUDGET_SETTINGS } from "./contextBudget";
import { DEFAULT_KEY_TEST_SETTINGS, testKeys } from "./lorebookKeyTest";
import type { NormalizedCard } from "./normalize";

/** One line of a test chat. `speakerId` is the character tab's slot id, or null for the user. */
export interface TestChatMessage {
  id: string;
  speakerId: string | null;
  name: string;
  content: string;
}

/** A character taking part in the test chat — the slot id plus its current (possibly unsaved) card. */
export interface TestChatMember {
  id: string;
  card: NormalizedCard;
}

export const USER_FALLBACK_NAME = "User";

/** SillyTavern's default World Info scan depth: keys are looked for in the last 2 messages. */
export const TEST_CHAT_SCAN_DEPTH = 2;

/** Rough per-message overhead of the chat template, so the history doesn't overfill the context. */
const MESSAGE_OVERHEAD_TOKENS = 4;

export function memberName(card: NormalizedCard): string {
  return card.name.trim() || "Character";
}

/** SillyTavern's name macros, including the legacy `<BOT>`/`<USER>` spellings. */
export function substituteMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}|<BOT>/gi, charName)
    .replace(/\{\{user\}\}|<USER>/gi, userName);
}

/** The greetings a single chat can start with: first message, then the alternates. */
export function greetingsFor(card: NormalizedCard): string[] {
  return [card.first_mes, ...card.alternate_greetings].filter((g) => g.trim());
}

/** How a fresh chat starts: the chosen greeting in a single chat; in a group, every member's first
 * message, like SillyTavern does when a group chat is created. */
export function startMessages(members: TestChatMember[], userName: string, greetingIndex = 0): TestChatMessage[] {
  const greet = (member: TestChatMember, text: string): TestChatMessage => ({
    id: crypto.randomUUID(),
    speakerId: member.id,
    name: memberName(member.card),
    content: substituteMacros(text, memberName(member.card), userName).trim(),
  });
  if (members.length === 1) {
    const greetings = greetingsFor(members[0].card);
    const text = greetings[greetingIndex] ?? greetings[0];
    return text ? [greet(members[0], text)] : [];
  }
  return members.filter((m) => m.card.first_mes.trim()).map((m) => greet(m, m.card.first_mes));
}

/** Round robin: the member after whoever of them spoke last. */
export function nextSpeaker(memberIds: string[], history: TestChatMessage[]): string | undefined {
  const last = [...history].reverse().find((m) => m.speakerId && memberIds.includes(m.speakerId));
  if (!last) return memberIds[0];
  return memberIds[(memberIds.indexOf(last.speakerId!) + 1) % memberIds.length];
}

export interface TestChatPromptInput {
  speakerId: string;
  members: TestChatMember[];
  userName: string;
  personaDescription: string;
  history: TestChatMessage[];
  count: (text: string) => number;
  settings?: BudgetSettings;
}

export interface TestChatPrompt {
  messages: AiChatMessage[];
  /** Labels of the speaker's lorebook entries that went into this prompt. */
  activeLore: string[];
  /** Older chat messages left out because they no longer fit the context. */
  droppedMessages: number;
  examplesIncluded: boolean;
}

function entryLabel(entry: { comment?: string; name?: string; keys: string[] }, index: number): string {
  return entry.comment?.trim() || entry.name?.trim() || entry.keys.find((k) => k.trim()) || `Entry ${index + 1}`;
}

/** Builds the prompt for one reply the way SillyTavern roughly assembles it for chat completion:
 * system prompt, World Info, character definitions, persona, example dialogue (dropped first when
 * space runs out), chat history (oldest dropped), Character's Note at its depth, post-history
 * instructions. In a group only the replying character's card and lorebook are used (ST's "swap"
 * mode); everyone else appears in the history with their name in front. An approximation: no
 * instruct template, no Author's Note, no WI probability rolls or timed effects. */
export function buildTestChatPrompt(input: TestChatPromptInput): TestChatPrompt {
  const { speakerId, members, userName, personaDescription, history, count } = input;
  const settings = input.settings ?? DEFAULT_BUDGET_SETTINGS;
  const speaker = members.find((m) => m.id === speakerId);
  if (!speaker) throw new Error("The replying character is not part of this chat.");
  const card = speaker.card;
  const charName = memberName(card);
  const isGroup = members.length > 1;
  const sub = (text: string) => substituteMacros(text, charName, userName).trim();

  const others = members.filter((m) => m.id !== speakerId).map((m) => memberName(m.card));
  const defaultMain = isGroup
    ? `Write ${charName}'s next reply in a fictional roleplay group chat between ${[charName, ...others].join(", ")} and ${userName}. Write only ${charName}'s reply.`
    : `Write ${charName}'s next reply in a fictional chat between ${charName} and ${userName}.`;
  const main = card.system_prompt.trim() ? sub(card.system_prompt.replace(/\{\{original\}\}/gi, defaultMain)) : defaultMain;

  // World Info: keys are matched against the last few messages, like ST's scan depth.
  const loreCap = Math.floor((settings.contextSize * settings.worldInfoPercent) / 100);
  const book = card.character_book;
  const activeLore: string[] = [];
  const loreBefore: string[] = [];
  const loreAfter: string[] = [];
  if (book && book.entries.length > 0) {
    const scanText = history
      .slice(-TEST_CHAT_SCAN_DEPTH)
      .map((m) => m.content)
      .join("\n");
    const { activations } = testKeys(book, scanText, DEFAULT_KEY_TEST_SETTINGS);
    const indices = activations.map((a) => a.index);
    // Constant entries first, then by insertion order (higher = more important) until the cap.
    const byPriority = [...indices].sort(
      (a, b) =>
        Number(!!book.entries[b].constant) - Number(!!book.entries[a].constant) ||
        book.entries[b].insertion_order - book.entries[a].insertion_order,
    );
    let used = 0;
    const kept = new Set<number>();
    for (const index of byPriority) {
      const tokens = count(book.entries[index].content);
      if (used + tokens > loreCap) continue;
      used += tokens;
      kept.add(index);
    }
    [...kept]
      .sort((a, b) => book.entries[a].insertion_order - book.entries[b].insertion_order)
      .forEach((index) => {
        const entry = book.entries[index];
        const content = sub(entry.content);
        if (!content) return;
        (entry.position === "after_char" ? loreAfter : loreBefore).push(content);
        activeLore.push(entryLabel(entry, index));
      });
  }

  const persona = sub(personaDescription);
  const definitions = [
    ...loreBefore,
    sub(card.description),
    card.personality.trim() ? `${charName}'s personality: ${sub(card.personality)}` : "",
    card.scenario.trim() ? `Scenario: ${sub(card.scenario)}` : "",
    ...loreAfter,
    persona ? `About ${userName}: ${persona}` : "",
  ].filter(Boolean);
  const systemText = [main, ...definitions].join("\n\n");

  const examplesText = sub(card.mes_example.replace(/<START>/gi, "\n"));
  const examples = examplesText
    ? `Example dialogue — shows how ${charName} writes, not part of the chat:\n${examplesText.replace(/\n{3,}/g, "\n\n")}`
    : "";

  const closing: AiChatMessage[] = [];
  const postHistory = sub(card.post_history_instructions.replace(/\{\{original\}\}/gi, ""));
  if (postHistory) closing.push({ role: "system", content: postHistory });
  if (isGroup) closing.push({ role: "system", content: `Reply only as ${charName}. Do not write lines for anyone else.` });

  const note = getCharacterNote(card);
  const noteText = sub(note.prompt);

  const tokens = (text: string) => count(text) + MESSAGE_OVERHEAD_TOKENS;
  let budget =
    settings.contextSize -
    settings.responseLength -
    tokens(systemText) -
    closing.reduce((sum, m) => sum + tokens(m.content), 0) -
    (noteText ? tokens(noteText) : 0);

  // History, newest first, until the context is full.
  const asMessage = (m: TestChatMessage): AiChatMessage =>
    m.speakerId === speakerId
      ? { role: "assistant", content: m.content }
      : { role: "user", content: isGroup || m.speakerId !== null ? `${m.name}: ${m.content}` : m.content };
  const kept: AiChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const message = asMessage(history[i]);
    const cost = tokens(message.content);
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(message);
  }
  const droppedMessages = history.length - kept.length;
  const examplesIncluded = !!examples && droppedMessages === 0 && tokens(examples) <= budget;

  // Merge neighbours with the same role: several templates (e.g. Mistral's) expect turns to alternate.
  const merged: AiChatMessage[] = [];
  for (const message of kept) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.content = `${last.content}\n\n${message.content}`;
    else merged.push({ ...message });
  }

  if (noteText) {
    const at = Math.max(0, merged.length - note.depth);
    merged.splice(at, 0, { role: note.role, content: noteText });
  }

  return {
    messages: [
      { role: "system", content: examplesIncluded ? `${systemText}\n\n${examples}` : systemText },
      ...merged,
      ...closing,
    ],
    activeLore,
    droppedMessages,
    examplesIncluded,
  };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Stop sequences so the model ends its turn before writing for someone else. */
export function stopSequencesFor(otherNames: string[]): string[] {
  return otherNames.filter((n) => n.trim()).map((n) => `\n${n.trim()}:`);
}

/** Cleans a raw reply: drops a leading "Name:" the model sometimes repeats, and cuts it off where it
 * starts writing lines for someone else (backends that ignore stop sequences). */
export function cleanReply(text: string, speakerName: string, otherNames: string[]): string {
  let reply = text.trim().replace(new RegExp(`^${escapeRegex(speakerName)}:\\s*`, "i"), "");
  const names = otherNames.filter((n) => n.trim()).map((n) => escapeRegex(n.trim()));
  if (names.length > 0) {
    const cut = reply.search(new RegExp(`(^|\\n)\\s*(${names.join("|")}):`, "i"));
    if (cut >= 0) reply = reply.slice(0, cut);
  }
  return reply.trim();
}
