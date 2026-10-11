/** The editable guidance in every AI prompt, by section key — what the user can change in the
 * prompts file. Only the *content* rules live here; the output-format lines ("Respond only with a
 * JSON object …", the exact field lists) stay in aiPrompt.ts, because the code that reads the
 * replies depends on them and an edit there would make a feature fail silently.
 *
 * Words in {braces} are placeholders: either filled in by the prompt builder ({count}, {name}, …)
 * or another section's text ({metric_units}), so a shared rule is edited in one place.
 * SillyTavern macros use double braces ({{char}}, {{user}}) and are never touched. */

interface PromptSection {
  /** Shown above the section in the prompts file. */
  about: string;
  text: string;
}

const lines = (...parts: string[]) => parts.join("\n");

export const DEFAULT_PROMPTS = {
  // ── Shared building blocks ──────────────────────────────────────────────────────────────────
  metric_units: {
    about: "Shared rule, used as {metric_units} in every prompt that writes card text.",
    text: "Use metric units for all measurements: height in cm or m (e.g. 180 cm), weight in kg, distances in m or km, temperatures in °C — never feet, inches, pounds, miles or °F.",
  },
  description_checklist: {
    about: "What a character description should cover (AI Assistant, Create Group).",
    text: "Cover physical appearance (build, hair, eyes, distinguishing features like scars or tattoos), typical clothing style, species/race if not human, age, and occupation/role. For the background/origin, include one specific formative experience rather than a neutral biography — something concrete enough to plausibly explain a fear, quirk, or behavior pattern the character has today.",
  },
  personality_checklist: {
    about: "What a character personality should cover (AI Assistant, Create Group).",
    text: "Cover core personality traits, likes, dislikes, quirks or speech mannerisms, notable skills or talents, fears or weaknesses, goals or motivations, secrets, and kinks (where relevant). Don't just list these as isolated facts: for at least one trait, quirk, or fear, name the causal link back to a past event or relationship (what happened, what belief or fear it created, how it shows up as a concrete behavior or tell today) — this makes the character playable, not just described.",
  },
  lorebook_entry_guidance: {
    about: "How lorebook entries are written (Lorebook AI assistant, filling in entries).",
    text: lines(
      "Write one entry per distinct person, place, faction, item, or concept — never bundle several into one entry.",
      'For a broad request (e.g. "a family for this character" or "a basic fantasy world"), create the foundational entries the topic needs and keep each one brief: the essentials only (what or who it is, a few defining facts, how it relates to the rest), about 2–5 sentences. The user will expand details later.',
      'keys are matched as plain text against recent chat messages, so use short words people would actually write: names, nicknames, and specific 1–2 word terms. Do not use long descriptive phrases, and do not use words that also match unrelated mentions — relationship words (mother, father, brother, sister, wife), or generic nouns (land, magic, town, king). Example for a mother named Elara Brightwood: good keys ["Elara", "Elara Brightwood"], bad keys ["Mother", "Mira\'s mother"].',
      'comment: a short human-readable label for the entry (e.g. "Mother Elara").',
      "Stay consistent with the existing lorebook entries, and write in the same language they use; if there are none, use the language of the user's instruction.",
    ),
  },

  // ── AI Assistant (character / persona) ─────────────────────────────────────────────────────
  assist_intro: {
    about: "AI Assistant for a character card: the opening line.",
    text: "You help fill in or revise a SillyTavern character card.",
  },
  persona_intro: {
    about: "AI Assistant for a persona: the opening line.",
    text: "You help write a SillyTavern user persona: the character the user plays in roleplay, not a character the AI plays.",
  },
  persona_description: {
    about: "AI Assistant for a persona: how the persona description is written.",
    text: "Write it in third person, referring to the persona by name (never use {{user}} or {{char}} macros). Focus on what other characters can perceive or plausibly know: physical appearance (build, hair, eyes, distinguishing features), typical clothing, age, species/race if not human, occupation/role, demeanor and how they come across, plus a few defining personality traits and only as much background as matters in interactions. Keep it compact — roughly 100–250 words — because it is sent with every message. Never write actions, dialogue, thoughts in the moment, or decisions for the persona, and don't describe how other characters feel about them.",
  },
  persona_language: {
    about: "AI Assistant for a persona: which language to write in.",
    text: "Write in the language of the user's instruction (or of the existing draft if it already has text) — not in the language of any character card given as context.",
  },
  persona_fit_one: {
    about: "Persona “Fit to characters” with one character ticked.",
    text: "The persona will be played opposite this character. Make the persona fit the character's setting and scenario — a plausible role in their world and a natural reason to interact with them — but don't describe the character, don't copy their traits, and don't decide how they feel about the persona.",
  },
  persona_fit_group: {
    about: "Persona “Fit to characters” with several characters ticked (a group chat).",
    text: "The persona will be played opposite all of these characters together, in one group chat. Make the persona fit their shared setting and scenario — one plausible role in their world and a natural reason to interact with each of them, not just with one. If their settings differ, find a role that plausibly connects them. Don't describe the characters, don't copy their traits, and don't decide how they feel about the persona.",
  },

  // ── Condense ───────────────────────────────────────────────────────────────────────────────
  condense: {
    about:
      "Condense (and shortening in “Merge into one card”). Placeholders: {field}, {current_tokens}, {target_tokens}.",
    text: lines(
      "You condense one field of a SillyTavern character card to save prompt tokens WITHOUT changing the character.",
      "Field: {field}. It is currently about {current_tokens} tokens. Aim for about {target_tokens} tokens — that is a floor as much as a ceiling: do not cut much below it, because shorter than that means facts are being lost.",
      'Every distinct fact must survive: names, ages, numbers, appearance and clothing details, traits (including qualifiers like "slightly"), likes and dislikes, attitudes and beliefs, habits, quirks, speech patterns, relationships, goals, secrets, and the cause-and-effect links in the backstory.',
      "Every item of an enumeration (likes, fetishes, kinks, skills, …) is a fact of its own: keep each one; you may merge near-duplicates into one word, but never drop items.",
      "Remove only redundancy: statements made twice, filler, flowery or purple prose, generic adjectives that add nothing, meta commentary. Keep any section labels or structure the original uses if they help, but write the content densely.",
      "Don't switch to keyword lists or W++/JSON-style notation unless the original already uses it.",
      "Keep the same language, point of view and tone, and keep macros like {{char}} and {{user}} exactly as written.",
    ),
  },
  condense_example_dialogue: {
    about: "Condense: extra rule for the example dialogue field.",
    text: "This is example dialogue: keep the <START> separators and the {{user}}:/{{char}}: line format. Shorten the exchanges, and drop the least characteristic ones before touching those that best show the character's voice.",
  },
  condense_first_message: {
    about: "Condense: extra rule for the first message field.",
    text: "This is the opening message of the roleplay: keep it a scene in the same voice and keep its hook; tighten the narration.",
  },
  condense_closing: {
    about: "Condense: the final checks.",
    text: lines(
      "Never add anything that isn't in the original — no new facts, motives, or interpretations. Before answering, check your version against the original: every fact still there, nothing added.",
      "{metric_units} Convert any imperial measurements in the original (feet/inches, pounds, miles, °F) to metric — this is the one change of content allowed.",
    ),
  },

  // ── Lorebooks ──────────────────────────────────────────────────────────────────────────────
  lorebook_intro: {
    about: "Lorebook AI assistant (new entries): the opening line.",
    text: "You help propose lorebook entries (World Info) for SillyTavern.",
  },
  lorebook_edit_intro: {
    about: "Filling in / revising selected lorebook entries. Placeholder: {count}.",
    text: lines(
      "You fill in or revise {count} existing lorebook entries (World Info) for SillyTavern.",
      "An entry with empty content needs its content written, based on its comment, its keys, and the rest of the lorebook. An entry that already has content should only change as far as the user's instruction asks; otherwise copy it through unchanged.",
    ),
  },
  member_entry: {
    about: "Group lorebook: the profile of one member that the other members get.",
    text: lines(
      "You write one lorebook entry (World Info) for a SillyTavern group chat: a short profile of one group member, inserted into the other members' prompts whenever this member is mentioned, so they know who they are dealing with.",
    ),
  },
  member_entry_rules: {
    about: "Group lorebook: what the member profile contains.",
    text: lines(
      "content: 2–4 sentences, at most 90 words, third person by name: who they are and their role, the most recognizable appearance details, their relationships to the other group members named in the message, and two or three defining traits or habits others would notice. Pick the essentials — this is a quick reference, not a summary of the whole card.",
      "Other members read this, so it must contain only what they could know: leave out secrets (affairs, hidden feelings, lies, things the member hides), backstory events others didn't witness, inner thoughts, fears and kinks.",
      "Use only facts the card states — never invent appearance, habits, traits or feelings, and don't embellish. The profile must not be longer than the card's own text: if the card is one short line, the profile is one short sentence.",
      'Relationships: the card\'s {{user}} and any unnamed relative (e.g. "her little brother") mean the human player, who is NOT a group member — write them as "{{user}}" (e.g. "protective of her little brother {{user}}"). Only connect this member to another group member if the card names that member and states the relationship; if unsure, leave the relationship out rather than guess (e.g. don\'t turn "Father Greg" into "father of Mary" — Mary might be his wife).',
      "keys: nicknames or alternative names the card uses for this member (the full and first name are added automatically). No relationship words like mother or sister, no generic nouns. An empty list is fine.",
      "comment: the member's name.",
      "{metric_units}",
      "Write in the language of the card. Never use the straight double-quote character inside the text; use ‘single’ or “curly” quotes instead.",
    ),
  },

  // ── Image prompt ───────────────────────────────────────────────────────────────────────────
  image_prompt_intro: {
    about: "Image prompt generator: the opening line (the model/art style rules follow from the app).",
    text: "You create a single image-generation prompt for a SillyTavern character's appearance.",
  },

  // ── Consistency check ──────────────────────────────────────────────────────────────────────
  consistency_check: {
    about: "Consistency Check: what counts as a contradiction.",
    text: lines(
      "You check several SillyTavern character cards meant to be used together as a group (e.g. a family or class) for contradictions.",
      "Examples: mismatched ages (e.g. a child older than a parent), contradictory family or relationship claims, name conflicts, contradictory timeline or location details in the backstory.",
    ),
  },
  consistency_fix: {
    about: "Consistency Check → Suggest fix: how a contradiction is fixed.",
    text: lines(
      "Change as little as possible: usually one or two passages in the card where the fix is smallest. Keep everything else, including the card's language, style and point of view.",
      "Fix only this contradiction, and make sure your fix doesn't create a new one with the other cards.",
      "If the user says which version is correct, follow that.",
      "{metric_units}",
    ),
  },

  // ── Create Group ───────────────────────────────────────────────────────────────────────────
  group_generate: {
    about: "Create Group. Placeholder: {count}.",
    text: lines(
      "You create {count} new, related SillyTavern characters at once (e.g. a family or class).",
      "Keep the characters consistent with each other: plausible age gaps, consistent surnames/family or relationship claims, no contradictions between members.",
    ),
  },
  group_references: {
    about: "Create Group with reference cards ticked.",
    text: lines(
      "The user also gives existing reference characters. Create only the new characters the instruction asks for — never re-create, rewrite or include a reference character.",
      "Everything the reference characters say is fact. If they mention one of the requested people (by name or by role), use those details — name, age, job, events, relationships — and build on them; never contradict them.",
      "Fit the new characters into the references' world: the same setting, era and shared history, and state each new character's relationship to the reference characters in their description.",
      "Write in the same language as the reference characters.",
    ),
  },
  group_persona: {
    about: "Create Group with a persona picked.",
    text: lines(
      "The user also gives their persona — the character the user plays in chats. Where the instruction or the setting suggests it, give the new characters a plausible relationship with the persona (e.g. neighbour, colleague, employer) that fits the persona's description.",
      "In the new cards, always write the persona as {{user}}, never by name. Don't describe the persona's looks or personality, and don't decide how the persona feels.",
    ),
  },
  group_integrate: {
    about: "Create Group → “Also update the reference cards”: what gets added to them.",
    text: lines(
      "- add: one or two new sentences about the new character(s): what this existing character would plausibly know — name, how they're related, maybe one key fact. Not a full profile.",
      '- after: the sentence in that field the new text belongs after, copied word for word — or "" to add it at the end of the field.',
      "Mostly add to the description; usually one addition per existing character is enough, mentioning every new character they know. Don't repeat what the card already says.",
      "Write each addition in that card's language, style and point of view, and use macros like {{char}} and {{user}} the way the card does.",
      "{metric_units}",
    ),
  },

  // ── Edit Group ─────────────────────────────────────────────────────────────────────────────
  relocate: {
    about: "Edit Group (move characters to a new setting). Placeholder: {count}.",
    text: lines(
      "You update {count} existing, related SillyTavern characters who are being moved to a new setting together.",
      "Keep each character's core identity the same: personality traits, backstory, formative experiences, and relationships to the others. Only adapt details tied to the old location — where they live/work/spend time, local references, and any setting-specific details in their scenario, first message, or example dialogue.",
    ),
  },

  // ── Split Card ─────────────────────────────────────────────────────────────────────────────
  split_people: {
    about: "Split Card, step 1: finding the people.",
    text: "List every person who is described, not just named. Leave out {{user}} and a narrator.",
  },
  split_member: {
    about:
      "Split Card, step 2: one person's card. Placeholder: {name}. Tip: “word for word” keeps small models from summarising.",
    text: lines(
      "- description: COPY everything the group card and the lorebook entries say about {name} — every detail, item and line, word for word and in the same format (Markdown headings stay headings, W++/PList entries like Age(\"18\") stay entries, prose stays prose). Do not summarise, shorten or rephrase. Leave out only what is solely about the others. Where a section describes several people at once, keep the parts that apply to {name}. Add one line naming {name}'s relationship to each of the others.",
      '- personality: only if the group card has a separate personality field with content about {name}; otherwise "".',
      "- scenario: the group card's scenario, told for {name}.",
      "- first_mes: a short new opening message (at most about 120 words) in which only {name} acts and speaks, set in the group card's opening situation.",
      "In the group card, {{char}} means the whole group or a narrator; write {name} by name instead, and leave out instructions about portraying several characters. Keep {{user}} exactly as written.",
      "Write in the group card's language.",
    ),
  },

  // ── Merge into one card ────────────────────────────────────────────────────────────────────
  merge_scenario: {
    about: "Merge into one card: a new scenario for the group.",
    text: "- scenario: 2–4 sentences: a situation that brings all of them together with {{user}}, consistent with their cards and relationships.",
  },
  merge_first_message: {
    about: "Merge into one card: a new first message for the group.",
    text: "- first_mes: the opening message of that scene, about 150–250 words, narrated in third person: every one of the characters appears and acts or speaks in their own voice. Never act or speak for {{user}}.",
  },
  merge_closing: {
    about: "Merge into one card: final rules for the new scene.",
    text: lines("Follow the user's note if there is one. Write in the same language as the cards.", "{metric_units}"),
  },
} satisfies Record<string, PromptSection>;

export type PromptKey = keyof typeof DEFAULT_PROMPTS;

export const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS) as PromptKey[];

/** Written in the prompts file to switch a section off entirely (an empty section means "use the
 * built-in text", so updates to the defaults still arrive). */
export const SECTION_OFF = "(none)";

let overrides: Partial<Record<PromptKey, string>> = {};

export function setPromptOverrides(next: Partial<Record<PromptKey, string>>): void {
  overrides = next;
}

const PLACEHOLDER = /(?<!\{)\{([a-z_]+)\}(?!\})/g;

/** A section's text — the user's version if the prompts file has one — with placeholders filled
 * in. `{other_section}` pulls in another section's text (one level deep, no loops). Unknown
 * placeholders are left as they are. */
export function promptText(key: PromptKey, vars: Record<string, string | number> = {}, depth = 0): string {
  const raw = overrides[key] ?? DEFAULT_PROMPTS[key].text;
  if (raw.trim() === SECTION_OFF) return "";
  return raw.replace(PLACEHOLDER, (match, name: string) => {
    if (name in vars) return String(vars[name]);
    if (depth === 0 && name in DEFAULT_PROMPTS) return promptText(name as PromptKey, vars, 1);
    return match;
  });
}

const FILE_HEADER = lines(
  "// SillyTavern Card Editor — AI prompts",
  "//",
  "// Each ### section is one part of what the AI is told. Edit its text to change how a feature",
  "// writes; the app reads this file at start and on “Reload prompts”.",
  "// - Delete a section, or leave it empty, to use the built-in text again (so improvements in",
  "//   app updates still reach you). Write (none) to switch a section off.",
  "// - Words in {single braces} are filled in by the app — {metric_units} inserts that section.",
  "//   SillyTavern macros like {{char}} and {{user}} are passed to the AI unchanged.",
  "// - Lines starting with // are comments. The reply format (JSON fields) is fixed in the app",
  "//   and can't be changed here.",
);

/** The full prompts file with every built-in section, as a starting point to edit. */
export function serializeDefaultPromptsFile(): string {
  const sections = PROMPT_KEYS.map((key) => `### ${key}\n// ${DEFAULT_PROMPTS[key].about}\n${DEFAULT_PROMPTS[key].text}`);
  return `${FILE_HEADER}\n\n${sections.join("\n\n")}\n`;
}

export interface ParsedPromptsFile {
  overrides: Partial<Record<PromptKey, string>>;
  /** Section names the app doesn't know (typos, or sections renamed in an update). */
  unknown: string[];
}

/** Reads the prompts file. Sections whose text equals the built-in one aren't counted as
 * overrides, so a freshly created file changes nothing and later default updates still apply. */
export function parsePromptsFile(content: string): ParsedPromptsFile {
  const result: ParsedPromptsFile = { overrides: {}, unknown: [] };
  let key: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (key === null) return;
    const text = body.join("\n").trim();
    if (!(key in DEFAULT_PROMPTS)) result.unknown.push(key);
    else if (text && text !== DEFAULT_PROMPTS[key as PromptKey].text) result.overrides[key as PromptKey] = text;
  };
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.match(/^###\s+(\S+)\s*$/);
    if (heading) {
      flush();
      key = heading[1];
      body = [];
    } else if (key !== null && !line.trimStart().startsWith("//")) {
      body.push(line);
    }
  }
  flush();
  return result;
}
