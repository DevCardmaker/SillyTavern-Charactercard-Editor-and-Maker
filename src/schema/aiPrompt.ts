import { type AiFieldKey, aiFieldLabel, type AiFieldPatch } from "./aiAssist";
import { type AiImageArtStyle, type AiImageModelStyle, imageArtStyleGuidance, imageModelStyleGuidance } from "./aiImagePrompt";
import type { AiLorebookEntryDraft } from "./aiLorebookAssist";
import type { AiLorebookEditEntry } from "./aiLorebookEdit";
import type { Lorebook } from "./lorebook";
import type { NormalizedCard } from "./normalize";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Patrick's group uses metric: every prompt that writes card text asks for it. */
const METRIC_UNITS =
  "Use metric units for all measurements: height in cm or m (e.g. 180 cm), weight in kg, distances in m or km, temperatures in °C — never feet, inches, pounds, miles or °F.";

/** Content checklists for fields where the model tends to drift toward only part of what the
 * field conventionally holds (e.g. "description" turning into pure backstory, appearance
 * forgotten) — same idea as `imageModelStyleGuidance` in aiImagePrompt.ts: hardcoded guidance the
 * model shouldn't have to infer, not something derived from the character itself. Named
 * constants (not just map values) so `buildGroupGenerateSystemPrompt` below can reuse the exact
 * same text without duplicating it — group generation has its own fixed description/personality
 * fields but doesn't go through `buildSystemPrompt`'s per-field-selection logic. */
const DESCRIPTION_CHECKLIST =
  "Cover physical appearance (build, hair, eyes, distinguishing features like scars or tattoos), typical clothing style, species/race if not human, age, and occupation/role. For the background/origin, include one specific formative experience rather than a neutral biography — something concrete enough to plausibly explain a fear, quirk, or behavior pattern the character has today.";

const PERSONALITY_CHECKLIST =
  "Cover core personality traits, likes, dislikes, quirks or speech mannerisms, notable skills or talents, fears or weaknesses, goals or motivations, secrets, and kinks (where relevant). Don't just list these as isolated facts: for at least one trait, quirk, or fear, name the causal link back to a past event or relationship (what happened, what belief or fear it created, how it shows up as a concrete behavior or tell today) — this makes the character playable, not just described.";

/** Fields without an entry here (name, scenario, first_mes, …) get no extra guidance line. */
const AI_FIELD_GUIDANCE: Partial<Record<AiFieldKey, string>> = {
  description: DESCRIPTION_CHECKLIST,
  personality: PERSONALITY_CHECKLIST,
};

/** Static instructions for the current turn — only mentions the fields the user actually
 * selected, so the model isn't tempted to invent content for fields it wasn't asked about. */
export function buildSystemPrompt(selected: readonly AiFieldKey[]): string {
  const fieldList = selected
    .map((key) => {
      const guidance = AI_FIELD_GUIDANCE[key];
      const line = `- ${key}: ${aiFieldLabel(key)}`;
      return guidance ? `${line}\n  ${guidance}` : line;
    })
    .join("\n");
  return [
    "You help fill in or revise a SillyTavern character card.",
    "Respond only with a JSON object containing exactly the following fields:",
    fieldList,
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "The current draft state and the user's instruction follow in the next message.",
  ].join("\n");
}

/** Fields the AI may fill for a persona — SillyTavern's "Convert to Persona" only carries over
 * name and description (plus the avatar), so nothing else would arrive. */
export const PERSONA_AI_FIELD_KEYS = ["name", "description"] as const satisfies readonly AiFieldKey[];

const PERSONA_DESCRIPTION_GUIDANCE =
  "Write it in third person, referring to the persona by name (never use {{user}} or {{char}} macros). Focus on what other characters can perceive or plausibly know: physical appearance (build, hair, eyes, distinguishing features), typical clothing, age, species/race if not human, occupation/role, demeanor and how they come across, plus a few defining personality traits and only as much background as matters in interactions. Keep it compact — roughly 100–250 words — because it is sent with every message. Never write actions, dialogue, thoughts in the moment, or decisions for the persona, and don't describe how other characters feel about them.";

/** Persona counterpart of `buildSystemPrompt`: a persona is the character the *user* plays, and
 * SillyTavern inserts its description so the AI characters know who they're talking to — a
 * different job from a character card, hence its own guidance instead of the card checklists. */
export function buildPersonaSystemPrompt(selected: readonly AiFieldKey[]): string {
  const fieldList = selected
    .map((key) => {
      const line = `- ${key}: ${key === "name" ? "The persona's name" : aiFieldLabel(key)}`;
      return key === "description" ? `${line}\n  ${PERSONA_DESCRIPTION_GUIDANCE}` : line;
    })
    .join("\n");
  return [
    "You help write a SillyTavern user persona: the character the user plays in roleplay, not a character the AI plays.",
    "Respond only with a JSON object containing exactly the following fields:",
    fieldList,
    "Write in the language of the user's instruction (or of the existing draft if it already has text) — not in the language of any character card given as context.",
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "The current draft state and the user's instruction follow in the next message.",
  ].join("\n");
}

/** Field-specific rules for condensing, where the field has a format of its own to preserve. */
const CONDENSE_FIELD_RULES: Partial<Record<AiFieldKey, string>> = {
  mes_example:
    "This is example dialogue: keep the <START> separators and the {{user}}:/{{char}}: line format. Shorten the exchanges, and drop the least characteristic ones before touching those that best show the character's voice.",
  first_mes:
    "This is the opening message of the roleplay: keep it a scene in the same voice and keep its hook; tighten the narration.",
};

/** System prompt for "condense this field": save prompt tokens without changing who the character
 * is. Reuses the field-patch response format (`{ "<field>": "..." }`). */
export function buildCondenseSystemPrompt(field: AiFieldKey, currentTokens: number, targetTokens: number): string {
  return [
    "You condense one field of a SillyTavern character card to save prompt tokens WITHOUT changing the character.",
    `Field: ${aiFieldLabel(field)}. It is currently about ${currentTokens} tokens. Aim for about ${targetTokens} tokens — that is a floor as much as a ceiling: do not cut much below it, because shorter than that means facts are being lost.`,
    "Every distinct fact must survive: names, ages, numbers, appearance and clothing details, traits (including qualifiers like \"slightly\"), likes and dislikes, attitudes and beliefs, habits, quirks, speech patterns, relationships, goals, secrets, and the cause-and-effect links in the backstory.",
    "Every item of an enumeration (likes, fetishes, kinks, skills, …) is a fact of its own: keep each one; you may merge near-duplicates into one word, but never drop items.",
    "Remove only redundancy: statements made twice, filler, flowery or purple prose, generic adjectives that add nothing, meta commentary. Keep any section labels or structure the original uses if they help, but write the content densely.",
    "Don't switch to keyword lists or W++/JSON-style notation unless the original already uses it.",
    "Keep the same language, point of view and tone, and keep macros like {{char}} and {{user}} exactly as written.",
    "Never use the straight double-quote character (\") inside the text: write inches as in (5 ft 11 in) and use ‘single’ or “curly” quotes for quotations.",
    ...(CONDENSE_FIELD_RULES[field] ? [CONDENSE_FIELD_RULES[field]] : []),
    "Never add anything that isn't in the original — no new facts, motives, or interpretations. Before answering, check your version against the original: every fact still there, nothing added.",
    `${METRIC_UNITS} Convert any imperial measurements in the original (feet/inches, pounds, miles, °F) to metric — this is the one change of content allowed.`,
    `Respond only with a JSON object of the form { "${field}": "..." } — no explanations, no extra fields.`,
  ].join("\n");
}

export function buildCondenseUserTurn(text: string): AiChatMessage {
  return { role: "user", content: `Original text:\n${text}` };
}

/** Serializes the current draft + the user's free-text instruction into one user message.
 * Each turn resends the full current draft rather than a growing chat transcript, so context
 * length depends on field count, not on how many refinement rounds have happened. */
export function buildUserTurn(instruction: string, draftValues: AiFieldPatch, context?: string): AiChatMessage {
  const draftJson = JSON.stringify(draftValues, null, 2);
  return {
    role: "user",
    content: `${context ? `${context}\n\n` : ""}Current draft:\n${draftJson}\n\nInstruction: ${instruction}`,
  };
}

/** Context block for writing a persona that fits a specific character: the persona should have a
 * plausible place in that character's world and scenario — without describing the character. */
export function buildPersonaFitContext(card: NormalizedCard): string {
  return [
    "The persona will be played opposite this character. Make the persona fit the character's setting and scenario — a plausible role in their world and a natural reason to interact with them — but don't describe the character, don't copy their traits, and don't decide how they feel about the persona.",
    `Character:\n${JSON.stringify(summarizeCardForAi(card), null, 2)}`,
  ].join("\n");
}

/** Shared writing guidance for every prompt that produces lorebook entry text — new entries as
 * well as filled/revised ones. Lorebook entries are deliberately lighter than character cards:
 * the user asked for foundations they can expand later ("a basic fantasy world: name, races,
 * whether there's magic"), not fully fleshed-out profiles. */
const LOREBOOK_ENTRY_GUIDANCE = [
  "Write one entry per distinct person, place, faction, item, or concept — never bundle several into one entry.",
  'For a broad request (e.g. "a family for this character" or "a basic fantasy world"), create the foundational entries the topic needs and keep each one brief: the essentials only (what or who it is, a few defining facts, how it relates to the rest), about 2–5 sentences. The user will expand details later.',
  "keys are matched as plain text against recent chat messages, so use short words people would actually write: names, nicknames, and specific 1–2 word terms. Do not use long descriptive phrases, and do not use words that also match unrelated mentions — relationship words (mother, father, brother, sister, wife), or generic nouns (land, magic, town, king). Example for a mother named Elara Brightwood: good keys [\"Elara\", \"Elara Brightwood\"], bad keys [\"Mother\", \"Mira's mother\"].",
  "comment: a short human-readable label for the entry (e.g. \"Mother Elara\").",
  "Stay consistent with the existing lorebook entries, and write in the same language they use; if there are none, use the language of the user's instruction.",
];

/** Static instructions for a lorebook-entry-generation turn. Unlike the card-field prompt, the
 * model here proposes *new* entries to add to an existing lorebook, not values to overwrite.
 * Used both for a card's embedded lorebook and for standalone World Info files. */
export function buildLorebookSystemPrompt(): string {
  return [
    "You help propose lorebook entries (World Info) for SillyTavern.",
    'Respond only with a JSON object of the form { "entries": [...] }.',
    "Each entry has:",
    "- keys: a list of keywords that should trigger this entry in chat",
    "- content: the actual background text (e.g. a description of a person, place, or event)",
    "- comment: a short human-readable label for the entry",
    ...LOREBOOK_ENTRY_GUIDANCE,
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
    "The existing lorebook, the current draft state (entries already proposed but not yet added) and the user's instruction follow in the next message. Don't repeat entries the lorebook already has.",
  ].join("\n");
}

/** Overview of a lorebook for AI context — name, description, and each entry's label + keys, but
 * not its content: a downloaded lorebook can have hundreds of entries, and the full text would
 * blow past a local model's context window. Capped at `maxEntries` for the same reason. */
export interface AiLorebookOverview {
  name: string;
  description: string;
  entries: { index: number; comment: string; keys: string[] }[];
  omittedEntries: number;
}

export function summarizeLorebookForAi(
  book: Lorebook | undefined,
  exclude: ReadonlySet<number> = new Set(),
  maxEntries = 100,
): AiLorebookOverview {
  const listed = (book?.entries ?? [])
    .map((entry, index) => ({ index, comment: entry.comment ?? "", keys: entry.keys }))
    .filter((entry) => !exclude.has(entry.index));
  return {
    name: book?.name ?? "",
    description: book?.description ?? "",
    entries: listed.slice(0, maxEntries),
    omittedEntries: Math.max(0, listed.length - maxEntries),
  };
}

/** Same resend-full-state pattern as `buildUserTurn`: each turn gets the complete current list
 * of proposed (not-yet-added) entries plus the new instruction, and returns the complete updated
 * list — avoids ambiguity about whether a follow-up instruction means "add" or "replace". */
export function buildLorebookUserTurn(
  instruction: string,
  draftEntries: AiLorebookEntryDraft[],
  overview?: AiLorebookOverview,
): AiChatMessage {
  const draftJson = JSON.stringify(draftEntries, null, 2);
  const context = overview ? `Existing lorebook:\n${JSON.stringify(overview, null, 2)}\n\n` : "";
  return {
    role: "user",
    content: `${context}Currently proposed entries:\n${draftJson}\n\nInstruction: ${instruction}`,
  };
}

/** Profile of one group member for the *other* members' lorebooks (SillyTavern group chats only
 * send the replying character's own card). One call per member: like condensing, a local model
 * summarizes one card far more faithfully than several at once. */
export function buildMemberEntrySystemPrompt(): string {
  return [
    "You write one lorebook entry (World Info) for a SillyTavern group chat: a short profile of one group member, inserted into the other members' prompts whenever this member is mentioned, so they know who they are dealing with.",
    'Respond only with a JSON object of the form { "entries": [ { "keys": [...], "content": "...", "comment": "..." } ] } containing exactly one entry.',
    "content: 2–4 sentences, at most 90 words, third person by name: who they are and their role, the most recognizable appearance details, their relationships to the other group members named in the message, and two or three defining traits or habits others would notice. Pick the essentials — this is a quick reference, not a summary of the whole card.",
    "Other members read this, so it must contain only what they could know: leave out secrets (affairs, hidden feelings, lies, things the member hides), backstory events others didn't witness, inner thoughts, fears and kinks.",
    "Use only facts the card states — never invent appearance, habits, traits or feelings, and don't embellish. The profile must not be longer than the card's own text: if the card is one short line, the profile is one short sentence.",
    "Relationships: the card's {{user}} and any unnamed relative (e.g. \"her little brother\") mean the human player, who is NOT a group member — write them as \"{{user}}\" (e.g. \"protective of her little brother {{user}}\"). Only connect this member to another group member if the card names that member and states the relationship; if unsure, leave the relationship out rather than guess (e.g. don't turn \"Father Greg\" into \"father of Mary\" — Mary might be his wife).",
    "keys: nicknames or alternative names the card uses for this member (the full and first name are added automatically). No relationship words like mother or sister, no generic nouns. An empty list is fine.",
    "comment: the member's name.",
    METRIC_UNITS,
    "Write in the language of the card. Never use the straight double-quote character inside the text; use ‘single’ or “curly” quotes instead.",
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

/** Only the lasting facts: scenario and first message describe a particular scene (who just came
 * home, who's being greeted), which the model otherwise turns into "relationships". */
export function buildMemberEntryUserTurn(member: NormalizedCard, otherMembers: string[]): AiChatMessage {
  const others = otherMembers.length ? otherMembers.join(", ") : "(none)";
  const card = { name: member.name, description: member.description, personality: member.personality };
  return {
    role: "user",
    content: `Other group members: ${others}\n\nMember card:\n${JSON.stringify(card, null, 2)}`,
  };
}

/** Static instructions for filling in / revising *existing* entries in place. */
export function buildLorebookEditSystemPrompt(count: number): string {
  return [
    `You fill in or revise ${count} existing lorebook entries (World Info) for SillyTavern.`,
    "An entry with empty content needs its content written, based on its comment, its keys, and the rest of the lorebook. An entry that already has content should only change as far as the user's instruction asks; otherwise copy it through unchanged.",
    ...LOREBOOK_ENTRY_GUIDANCE,
    `Respond only with a JSON object of the form { "entries": [...] } with exactly ${count} entries.`,
    "Each entry has: index (exactly as given, unchanged), keys, comment, content.",
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

/** Fallback when the user just hits "Send" on a selection without typing anything. */
export const DEFAULT_LOREBOOK_EDIT_INSTRUCTION = "Write the content for the entries that are still empty.";

export function buildLorebookEditUserTurn(
  overview: AiLorebookOverview,
  entries: AiLorebookEditEntry[],
  instruction: string,
): AiChatMessage {
  return {
    role: "user",
    content: [
      `Rest of the lorebook (for context only, don't return these):\n${JSON.stringify(overview, null, 2)}`,
      `Entries to fill in or revise:\n${JSON.stringify(entries, null, 2)}`,
      `Instruction: ${instruction.trim() || DEFAULT_LOREBOOK_EDIT_INSTRUCTION}`,
    ].join("\n\n"),
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

/** Static instructions for resolving one finding of the consistency check with minimal edits.
 * Find/replace instead of rewritten fields, so nothing unrelated to the contradiction changes —
 * the code then checks every quoted passage really exists (see `resolveFixChanges`). */
export function buildConsistencyFixSystemPrompt(): string {
  return [
    "You fix one contradiction between SillyTavern character cards that belong to the same group, with the smallest possible text edits.",
    'Respond only with a JSON object of the form { "explanation": "...", "changes": [...] }.',
    "- explanation: one short sentence saying how the contradiction is resolved (which version is kept and what changes).",
    "- changes: each has character (the name exactly as given), field (description, personality, scenario or first_mes), find and replace.",
    "- find: a passage copied word for word from that character's field — short (a sentence or part of one) but long enough to be unique.",
    "- replace: that passage, corrected — complete sentences that read naturally in place of the old passage, ending the same way it did.",
    "Change as little as possible: usually one or two passages in the card where the fix is smallest. Keep everything else, including the card's language, style and point of view.",
    "Fix only this contradiction, and make sure your fix doesn't create a new one with the other cards.",
    "If the user says which version is correct, follow that.",
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

export function buildConsistencyFixUserTurn(characters: AiCharacterSummary[], issue: string, hint: string): AiChatMessage {
  const payload = JSON.stringify(
    characters.map(({ name, description, personality, scenario, first_mes }) => ({ name, description, personality, scenario, first_mes })),
    null,
    2,
  );
  const trimmed = hint.trim();
  return {
    role: "user",
    content: `Characters:\n${payload}\n\nContradiction: ${issue}${trimmed ? `\n\nThe user decided: ${trimmed}` : ""}`,
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
    `For description: ${DESCRIPTION_CHECKLIST}`,
    `For personality: ${PERSONALITY_CHECKLIST}`,
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

export function buildGroupGenerateUserTurn(instruction: string): AiChatMessage {
  return { role: "user", content: `Instruction: ${instruction}` };
}

/** `summarizeCardForAi` leaves out `mes_example` (not "biographically relevant" for the consistency
 * check / group generate use cases) — relocate needs it too, since example dialogue can reference
 * the old setting. Kept as its own summary rather than widening `AiCharacterSummary` for every
 * consumer that doesn't need it. */
export interface AiRelocateSummary extends AiCharacterSummary {
  mes_example: string;
}

export function summarizeCardForRelocate(card: NormalizedCard): AiRelocateSummary {
  return { ...summarizeCardForAi(card), mes_example: card.mes_example };
}

/** Static instructions for moving a group of *existing* characters to a new setting together
 * (e.g. "the family moves from New York to Tokyo"). This is an *adaptation*, not a rewrite from
 * scratch like `buildGroupGenerateSystemPrompt` — deliberately does NOT reuse
 * `DESCRIPTION_CHECKLIST`/`PERSONALITY_CHECKLIST` (those are for inventing a formative experience,
 * which would fight against preserving the one the character already has). Core identity and
 * backstory must survive; only setting-tied details change. */
export function buildRelocateSystemPrompt(count: number): string {
  return [
    `You update ${count} existing, related SillyTavern characters who are being moved to a new setting together.`,
    "Keep each character's core identity the same: personality traits, backstory, formative experiences, and relationships to the others. Only adapt details tied to the old location — where they live/work/spend time, local references, and any setting-specific details in their scenario, first message, or example dialogue.",
    `Respond only with a JSON object of the form { "characters": [...] } with exactly ${count} entries.`,
    "Each entry has:",
    "- name: exactly as given for that character, unchanged",
    "- description, personality, scenario, first_mes, mes_example: the same character, each adapted to the new setting only where relevant — copy through unchanged whatever isn't location-tied",
    METRIC_UNITS,
    "Give no explanations, no prose outside the JSON, and no extra fields.",
  ].join("\n");
}

/** Feeds every open character's current summary as context (so the model can see who's who and
 * keep them consistent) plus the new setting/instruction — same shape as
 * `buildConsistencyCheckUserTurn`, but with `mes_example` included too (see `AiRelocateSummary`). */
export function buildRelocateUserTurn(characters: AiRelocateSummary[], instruction: string): AiChatMessage {
  const payload = JSON.stringify(characters, null, 2);
  return {
    role: "user",
    content: `Characters:\n${payload}\n\nNew setting: ${instruction}`,
  };
}
