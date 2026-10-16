import { z } from "zod";

/** Turning a story (fan fiction, a short story, an excerpt from a book) into character cards, in
 * passes — a local model can't hold a whole story and write good cards from it at once:
 *  1. the story is cut into parts, and for each part the model only lists the people in it; the
 *     code merges those lists (one person appears in many parts, under several names) and counts
 *     how often each one is mentioned;
 *  2. the user picks who gets a card;
 *  3. for each picked person the code collects only the paragraphs that mention them, the model
 *     turns those into short notes, batch by batch;
 *  4. the notes become the card — written new, in the model's own words, so a card made from a
 *     book doesn't carry long passages of it;
 *  5. scenario and first message start a new scene after the story's end (or at the user's note). */

/** The notes on how the story ends for a person — those from the last part(s) they appear in,
 * at least `min` of them — for the scene pass. */
export function endingNotes(notes: string[][], min = 6): string[] {
  const out: string[] = [];
  for (let i = notes.length - 1; i >= 0 && out.length < min; i--) out.unshift(...notes[i]);
  return out;
}

/** Tokens per part in the people pass. */
export const STORY_PART_TOKENS = 1500;
/** Paragraphs longer than this are cut further (at line breaks, then at sentences). */
const PARAGRAPH_TOKENS = 400;

type Count = (text: string) => number;

/** The story as paragraphs. Blank lines separate paragraphs; a text without them (pasted fan
 * fiction often has one line per paragraph) is cut at line breaks instead, and a single very long
 * paragraph at sentence ends — so every paragraph is small enough to be picked on its own. */
export function storyParagraphs(text: string, count: Count): string[] {
  const out: string[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (count(trimmed) <= PARAGRAPH_TOKENS) {
      out.push(trimmed);
      continue;
    }
    for (const line of trimmed.split(/\n/)) {
      const l = line.trim();
      if (!l) continue;
      if (count(l) <= PARAGRAPH_TOKENS) out.push(l);
      else out.push(...packPieces(l.split(/(?<=[.!?…»“”"])\s+/), count, PARAGRAPH_TOKENS, " "));
    }
  }
  return out;
}

/** Packs consecutive pieces into groups of at most `max` tokens (a single larger piece stays alone). */
export function packPieces(pieces: string[], count: Count, max: number, joiner = "\n\n"): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const piece of pieces) {
    const n = count(piece);
    if (current.length > 0 && size + n > max) {
      groups.push(current.join(joiner));
      current = [];
      size = 0;
    }
    current.push(piece);
    size += n;
  }
  if (current.length > 0) groups.push(current.join(joiner));
  return groups;
}

// ── People pass ─────────────────────────────────────────────────────────────────────────────────

const aiStoryPeopleSchema = z.object({
  people: z
    .array(
      z.object({
        // Length limits go into the JSON schema, so the grammar stops a model caught in a loop
        // (live test: Rocinante repeated two sentences in "role" until the token limit).
        name: z.string().max(80),
        also_called: z.array(z.string().max(60)).max(6),
        role: z.string().max(160),
      }),
    )
    .max(30),
});

export type AiStoryPerson = z.infer<typeof aiStoryPeopleSchema>["people"][number];

export function aiStoryPeopleToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiStoryPeopleSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

export function parseAiStoryPeople(raw: unknown): ParseResult<AiStoryPerson[]> {
  const result = aiStoryPeopleSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return {
    success: true,
    data: result.data.people
      .map((p) => {
        // "Grete Samsa (Gregor's sister)": the explanation belongs in the role, not the name.
        const extra = p.name.match(/\(([^)]*)\)/)?.[1]?.trim() ?? "";
        const name = p.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
        const role = p.role.trim() || extra;
        const also_called = p.also_called.map((a) => a.replace(/\s*\([^)]*\)\s*/g, " ").trim()).filter(Boolean);
        return { name, also_called, role };
      })
      .filter((p) => p.name && !/^\{\{.*\}\}$/.test(p.name)),
  };
}

/** Checks one part's list against the part's text — the model's "also called" isn't reliable:
 * it added "the narrator" and another person's name ("John Watson" for Holmes), which would merge
 * two people into one. An alias is kept only if it's written in the part and isn't (or doesn't
 * contain) another listed person's name. */
export function cleanPartPeople<T extends { name: string; also_called: string[] }>(people: T[], part: string): T[] {
  const text = part.toLowerCase();
  const names = people.map((p) => p.name.toLowerCase());
  return people.flatMap((p) => {
    const also_called = p.also_called.filter((alias) => {
      const a = alias.toLowerCase();
      if (a === p.name.toLowerCase() || !text.includes(a.replace(LEADING_ARTICLE, ""))) return false;
      return !names.some((n) => n !== p.name.toLowerCase() && (a === n || a.includes(n) || n.includes(a)));
    });
    // The name itself must be in the text too: the model invented one ("Herr Zipes" for Kafka's
    // nameless chief clerk) and translated labels ("the mother" for "die Mutter"). Then a written
    // alias takes its place, or the entry goes.
    if (writtenIn(p.name, text)) return [{ ...p, also_called }];
    const [first, ...rest] = also_called;
    return first ? [{ ...p, name: first, also_called: rest }] : [];
  });
}

/** Whether a name is written in the (lowercased) text: a description as a phrase, a name by at
 * least one of its distinctive words (a part may only say "Watson" for "Dr. John Watson") — as
 * whole words: a misspelt "Grego" is part of "Gregor", but isn't written in the text. */
function writtenIn(name: string, text: string): boolean {
  if (isLabel(name)) return mentionPattern([labelPhrase(name)], true)?.test(text) ?? false;
  const own = words(name).filter((w) => !NAME_FILLER.has(w));
  // Only an -s/-es ending ("Gregors"): with the usual two free letters, "Grego" + "r" is "Gregor".
  return (mentionPattern(own.length > 0 ? own : [labelPhrase(name)], true)?.test(text)) ?? false;
}

/** One person across the whole story, after the code merged the lists of all parts. */
export interface StoryPerson {
  name: string;
  /** Other names the story uses for them (nicknames, surname only, title). */
  aliases: string[];
  /** The roles the parts gave, most informative first. */
  roles: string[];
  /** How many paragraphs mention them — the main characters come first. */
  mentions: number;
  /** Names the user said belong to this person ("die Schwester" → Grete): always used for
   * recognising them, also descriptions the code otherwise skips as too vague ("the sister"). */
  userAliases?: string[];
  /** Tells the story in first person — then every paragraph is about them, named or not. Set by
   * the user: asked per part, the model marked the wrong person (Holmes in a Watson story) about
   * as often as the right one. */
  narrator: boolean;
}

/** Words in a name that don't say *which* person it is. Dropped when matching, unless nothing
 * else is left ("the mother", "die Mutter" are matched on "mother"/"mutter"). */
const NAME_FILLER = new Set([
  "the", "of", "and", "von", "van", "der", "die", "das", "den", "dem", "des", "ein", "eine", "le", "la", "de",
  "mr", "mrs", "ms", "miss", "sir", "lady", "lord", "dr", "doctor", "prof", "herr", "frau", "fräulein",
  "uncle", "aunt", "auntie", "onkel", "tante", "old", "young", "little", "alte", "alter", "junge", "kleine",
  // Small words of descriptive names ("Herr mit dem Bart", "the man with the hat").
  "mit", "bei", "aus", "vom", "zum", "zur", "und", "with", "from", "for", "at", "in", "on",
]);

/** The words of a name. In "Gregor's mother" the possessor is someone else's name, so it's left out. */
function words(name: string): string[] {
  return name
    .replace(/[\p{L}\p{N}]+['’]s\b/gu, " ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
}

export const LEADING_ARTICLE = /^(?:the|a|an|der|die|das|den|dem|des|ein|eine|einer|einem|einen|le|la|les|el|un|une)\s+/i;

/** A description rather than a name: "the elderly woman", "a nurse-girl", "Several well-dressed
 * men" — no capital letter after the article, except where the description starts a sentence.
 * Matched as a whole phrase, since its single words ("woman", "several") would match half the
 * story. A single word ("Gregor", "Bedienerin") is always a name. (German capitalises every noun,
 * so "die Mutter" counts as a name and is matched on "Mutter" — how the story refers to her.) */
export function isLabel(name: string): boolean {
  const rest = name.trim().replace(LEADING_ARTICLE, "");
  const [first, ...others] = rest.split(/\s+/);
  if (others.length === 0) return !/\p{Lu}/u.test(first ?? "");
  return !/\p{Lu}/u.test(first.slice(1) + others.join(" "));
}

export function labelPhrase(name: string): string {
  return name.trim().replace(LEADING_ARTICLE, "").toLowerCase();
}

/** The words (or, for a description, the phrase) a person is recognised by in the text: only
 * words that belong to them alone — a family name shared with others ("Samsa" for Gregor, Grete
 * and their parents) or another person's name in a label ("Gregor's mother") would match the
 * others' paragraphs too. If nothing is left, their full name as a phrase. Aliases that start with
 * an article ("the lady", "the King") are descriptions and aren't used either. */
export function personWords(
  person: { name: string; aliases: string[]; userAliases?: string[] },
  others: { name: string; aliases: string[] }[] = [],
): string[] {
  // Descriptions the user assigned are matched as phrases, like a description name.
  const assigned = (person.userAliases ?? []).filter(isLabel).map(labelPhrase).filter((p) => p.length >= 3);
  if (isLabel(person.name)) {
    const phrase = labelPhrase(person.name);
    return [...new Set([...(phrase.length >= 3 ? [phrase] : []), ...assigned])];
  }
  // "die Schwester", "the King": usable through their noun if no one else has it; lowercase
  // descriptions ("the lady", "the woman") aren't — they'd match anyone.
  const usable = (n: string) => !isLabel(n);
  const taken = new Set(others.flatMap((o) => [o.name, ...o.aliases].filter(usable).flatMap(words)));
  const names = [person.name, ...person.aliases.filter(usable)];
  const all = names.flatMap(words).filter((w) => w.length >= 3);
  const own = all.filter((w) => !NAME_FILLER.has(w) && !taken.has(w));
  if (own.length > 0) return [...new Set([...own, ...assigned])];
  const phrase = labelPhrase(person.name);
  return [...new Set([...(phrase.length >= 3 ? [phrase] : []), ...assigned])];
}

/** Makes `from` part of `into` — the user said they're one person ("die Schwester" is Grete
 * Samsa): its names become aliases of `into`, also as assigned names (see `userAliases`). */
export function mergePersonInto<T extends StoryPerson>(into: T, from: StoryPerson): T {
  const names = [from.name, ...from.aliases, ...(from.userAliases ?? [])];
  const known = new Set([into.name, ...into.aliases].map(nameKey));
  return {
    ...into,
    aliases: [...into.aliases, ...names.filter((n) => !known.has(nameKey(n)))],
    userAliases: [...new Set([...(into.userAliases ?? []), ...names])],
    roles: [...new Set([...into.roles, ...from.roles])],
    narrator: into.narrator || from.narrator,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches any of the words as a whole word, allowing a short ending (Gregor → Gregors,
 * Holmes → Holmes's) but not a longer word that merely starts the same (Anna ≠ Annahme). With
 * `pluralOnly` the ending may only be a plural -s/-es: for descriptions and common nouns, where
 * two free letters turn "wit" into "with" (live test: 41 paragraphs). */
export function mentionPattern(wordList: string[], pluralOnly = false): RegExp | null {
  if (wordList.length === 0) return null;
  const alternatives = wordList.map((w) => escapeRegExp(w).replace(/\s+/g, "\\s+")).join("|");
  const ending = pluralOnly ? "(?:e?s)?" : "\\p{L}{0,2}";
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})${ending}(?![\\p{L}\\p{N}])`, "iu");
}

/** The paragraphs that mention the person, in story order (by index). */
export function paragraphsMentioning(
  paragraphs: string[],
  person: { name: string; aliases: string[]; userAliases?: string[]; narrator?: boolean },
  others: { name: string; aliases: string[] }[] = [],
): number[] {
  if (person.narrator) return paragraphs.map((_, i) => i);
  const pattern = mentionPattern(personWords(person, others), isLabel(person.name));
  if (!pattern) return [];
  return paragraphs.flatMap((p, i) => (pattern.test(p) ? [i] : []));
}

/** Compares names: case, a leading article and dots don't matter ("The Count Von Kramm" = "count von kramm"). */
export function nameKey(name: string): string {
  return name.trim().replace(LEADING_ARTICLE, "").replace(/\./g, "").replace(/\s+/g, " ").toLowerCase();
}

/** Forms of address that tell people apart: "Mr. Samsa" and "Mrs. Samsa" are two people. */
const TITLE_GROUPS = [
  ["mr", "herr", "sir", "lord", "uncle", "onkel", "monsieur", "señor", "signor"],
  ["mrs", "ms", "miss", "frau", "fräulein", "lady", "aunt", "auntie", "tante", "madame", "mademoiselle", "señora", "signora"],
];

function titleGroup(names: string[]): Set<number> {
  const found = new Set<number>();
  for (const w of names.flatMap(words)) TITLE_GROUPS.forEach((g, i) => g.includes(w) && found.add(i));
  return found;
}

/** Both have a form of address, and they differ. */
function titlesClash(a: string[], b: string[]): boolean {
  const ta = titleGroup(a);
  const tb = titleGroup(b);
  return ta.size > 0 && tb.size > 0 && ![...ta].some((t) => tb.has(t));
}

const distinctiveWords = (n: string) => (isLabel(n) ? [] : words(n).filter((w) => !NAME_FILLER.has(w)));

interface PersonGroup {
  names: string[];
  roles: string[];
}

function absorb(into: PersonGroup, from: PersonGroup): void {
  for (const n of from.names) if (!into.names.some((m) => nameKey(m) === nameKey(n))) into.names.push(n);
  for (const r of from.roles) if (!into.roles.includes(r)) into.roles.push(r);
}

/** The name a group is shown by: the one with the most name words, then the shortest spelling
 * ("Sherlock Holmes" rather than "Holmes" or "Mr. Sherlock Holmes"). */
function mainName(group: PersonGroup): string {
  return [...group.names].sort(
    (a, b) => distinctiveWords(b).length - distinctiveWords(a).length || a.length - b.length,
  )[0];
}

/** Merges name lists (of people, or of places and things) from all parts, in three steps:
 *  1. a shared name or alias is the same person (also across several entries at once);
 *  2. the same name words are the same person ("Dr. Watson" = "Watson");
 *  3. a name whose words are all part of exactly one other, longer name is that person ("Watson"
 *     in "John Watson") — but not if it fits several ("Holmes": Sherlock *and* Mycroft).
 * Each group keeps the names and the roles (or descriptions) of everything merged into it. */
export function mergeNameGroups(found: { names: string[]; roles: string[] }[]): { name: string; names: string[]; roles: string[] }[] {
  let groups: PersonGroup[] = [];
  for (const entry of found) {
    const group: PersonGroup = { names: [...entry.names], roles: [...entry.roles] };
    const keys = group.names.map(nameKey);
    const matches = groups.filter((g) => g.names.some((n) => keys.includes(nameKey(n))));
    for (const m of matches) absorb(group, m);
    groups = [...groups.filter((g) => !matches.includes(g)), group];
  }

  const setKey = (n: string) => [...new Set(distinctiveWords(n))].sort().join(" ");
  const bySet = new Map<string, PersonGroup>();
  for (const group of [...groups]) {
    const key = setKey(mainName(group));
    if (!key) continue;
    const existing = bySet.get(key);
    if (existing && !titlesClash(existing.names, group.names)) {
      absorb(existing, group);
      groups = groups.filter((g) => g !== group);
    } else if (!existing) bySet.set(key, group);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const byLength = [...groups].sort((a, b) => distinctiveWords(mainName(a)).length - distinctiveWords(mainName(b)).length);
    for (const group of byLength) {
      const own = [...new Set(distinctiveWords(mainName(group)))];
      if (own.length === 0) continue;
      const hosts = groups.filter((other) => {
        if (other === group || titlesClash(other.names, group.names)) return false;
        const theirs = other.names.flatMap(distinctiveWords);
        return own.every((w) => theirs.includes(w)) && new Set(distinctiveWords(mainName(other))).size > own.length;
      });
      if (hosts.length !== 1) continue;
      absorb(hosts[0], group);
      groups = groups.filter((g) => g !== group);
      changed = true;
      break;
    }
  }

  return groups.map((g) => ({ name: mainName(g), names: g.names, roles: g.roles }));
}

/** Merges the people lists of all parts into one list (see `mergeNameGroups`), then counts each
 * person's paragraphs and sorts by that. */
export function mergeStoryPeople(lists: AiStoryPerson[][], paragraphs: string[]): StoryPerson[] {
  const groups = mergeNameGroups(lists.flat().map((f) => ({ names: [f.name, ...f.also_called], roles: f.role ? [f.role] : [] })));
  const people: StoryPerson[] = groups.map((g) => {
    const name = g.name;
    return {
      name,
      aliases: g.names.filter((n) => n !== name),
      roles: [...g.roles].sort((a, b) => b.length - a.length),
      mentions: 0,
      narrator: false,
    };
  });
  countMentions(people, paragraphs);
  // No paragraph of their own: a misspelling ("Greta Samsa") that only got through on a shared
  // family name.
  return people.filter((p) => p.mentions > 0).sort((a, b) => b.mentions - a.mentions);
}

/** Counts each person's paragraphs (against everyone else, see `personWords`). Called again when
 * the user adds a name or marks the narrator. */
export function countMentions(people: StoryPerson[], paragraphs: string[]): void {
  for (const person of people) {
    person.mentions = paragraphsMentioning(paragraphs, person, people.filter((p) => p !== person)).length;
  }
}

// ── Notes pass ──────────────────────────────────────────────────────────────────────────────────

/** Each note says whom it is about: asked for notes on Grete, the model also noted things about
 * Gregor in parts where she only appears briefly — the code drops those (see `notesAbout`). */
const aiStoryNotesSchema = z.object({
  notes: z
    .array(z.object({ who: z.string().max(80), note: z.string().max(400) }))
    .max(30),
});

export type AiStoryNote = z.infer<typeof aiStoryNotesSchema>["notes"][number];

export function aiStoryNotesToJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(aiStoryNotesSchema) as Record<string, unknown>;
  return { ...schema, additionalProperties: false };
}

export function parseAiStoryNotes(raw: unknown): ParseResult<AiStoryNote[]> {
  const result = aiStoryNotesSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  const seen = new Set<string>();
  return {
    success: true,
    data: result.data.notes
      .map((n) => ({ who: n.who.trim(), note: n.note.trim().replace(/^[-•*]\s*/, "") }))
      .filter((n) => {
        const key = n.note.toLowerCase();
        if (!n.note || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
  };
}

/** The notes that are about the person: their name (or an alias, or one of their own words) in
 * "who" — but not "Grete's mother", which is someone else. */
export function notesAbout(
  notes: AiStoryNote[],
  person: { name: string; aliases: string[] },
  others: { name: string; aliases: string[] }[],
): string[] {
  const keys = new Set([person.name, ...person.aliases].map(nameKey));
  const pattern = mentionPattern(personWords(person, others));
  return notes
    .filter((n) => keys.has(nameKey(n.who)) || (!!pattern && pattern.test(n.who) && !/['’]s\s/.test(n.who)))
    .map((n) => n.note);
}

/** Writes {{user}} where the story character the user plays is named — in the card and the opening
 * scene. Asked to do it, the model kept writing the name. The full names first, then the words
 * that are theirs alone ("Gregor", not the family name "Samsa"). */
export function nameToUser(
  text: string,
  person: { name: string; aliases: string[]; userAliases?: string[] },
  others: { name: string; aliases: string[] }[],
): string {
  let out = text;
  // Assigned descriptions go whole, article and all: "the sister" → "{{user}}", not "the {{user}}".
  const fullNames = [
    ...[person.name, ...person.aliases].filter((n) => !isLabel(n) && n.trim().includes(" ")),
    ...(person.userAliases ?? []).filter((n) => n.trim().includes(" ")),
  ].sort((a, b) => b.length - a.length);
  for (const n of fullNames) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n.trim()).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu"), "{{user}}");
  }
  const own = personWords(person, others).filter((w) => !w.includes(" "));
  if (own.length > 0) {
    // A genitive s stays: "Gregors Zimmer" → "{{user}}s Zimmer" (in the chat: "Annas Zimmer").
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}{])(?:${own.map(escapeRegExp).join("|")})(s?)(?![\\p{L}\\p{N}])`, "giu"),
      "{{user}}$1",
    );
  }
  return out;
}

// ── Language ────────────────────────────────────────────────────────────────────────────────────

/** Frequent short words per language — enough to tell the common Latin-script languages apart. */
const LANGUAGE_WORDS: Record<string, string[]> = {
  English: ["the", "and", "of", "to", "was", "he", "she", "it", "that", "with", "his", "her", "you"],
  German: ["und", "der", "die", "das", "nicht", "sie", "ist", "ein", "zu", "mit", "sich", "auf", "ich"],
  French: ["le", "la", "les", "et", "est", "que", "une", "pas", "il", "dans", "elle", "je", "des"],
  Spanish: ["el", "la", "que", "y", "los", "una", "por", "con", "no", "se", "las", "del", "es"],
  Italian: ["il", "che", "di", "e", "la", "non", "un", "per", "una", "sono", "si", "gli", "della"],
  Portuguese: ["o", "a", "que", "não", "de", "um", "uma", "com", "os", "é", "se", "do", "ela"],
  Dutch: ["de", "het", "een", "en", "van", "niet", "dat", "ik", "je", "zijn", "op", "hij", "ze"],
  Polish: ["i", "nie", "się", "że", "to", "na", "w", "jest", "z", "jak", "ale", "do", "jej"],
};

/** The story's language, as an English name ("German"), or null if the code can't tell. By script
 * for non-Latin text, otherwise by its most frequent short words. The user can change it. */
export function detectStoryLanguage(text: string): string | null {
  const sample = text.slice(0, 20000);
  const letters = (re: RegExp) => (sample.match(re) ?? []).length;
  const total = letters(/\p{L}/gu);
  if (total === 0) return null;
  if (letters(/\p{Script=Hangul}/gu) > total * 0.3) return "Korean";
  if (letters(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) > total * 0.1) return "Japanese";
  if (letters(/\p{Script=Han}/gu) > total * 0.3) return "Chinese";
  if (letters(/\p{Script=Cyrillic}/gu) > total * 0.5) return /[іїєґ]/i.test(sample) ? "Ukrainian" : "Russian";
  if (letters(/\p{Script=Greek}/gu) > total * 0.5) return "Greek";
  if (letters(/\p{Script=Arabic}/gu) > total * 0.5) return "Arabic";
  if (letters(/\p{Script=Hebrew}/gu) > total * 0.5) return "Hebrew";
  const words = sample.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 20) return null;
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  let best: string | null = null;
  let bestScore = 0;
  for (const [language, list] of Object.entries(LANGUAGE_WORDS)) {
    const score = list.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / words.length;
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return bestScore >= 0.08 ? best : null;
}

/** Language names as users type them (also in German) → the names `detectStoryLanguage` returns. */
const LANGUAGE_NAMES: Record<string, string> = {
  english: "English", englisch: "English",
  german: "German", deutsch: "German",
  french: "French", französisch: "French", franzoesisch: "French",
  spanish: "Spanish", spanisch: "Spanish",
  italian: "Italian", italienisch: "Italian",
  portuguese: "Portuguese", portugiesisch: "Portuguese",
  dutch: "Dutch", niederländisch: "Dutch", holländisch: "Dutch",
  polish: "Polish", polnisch: "Polish",
  russian: "Russian", russisch: "Russian",
  japanese: "Japanese", japanisch: "Japanese",
  chinese: "Chinese", chinesisch: "Chinese",
  korean: "Korean", koreanisch: "Korean",
};

/** Whether a reply is clearly in another language than asked for — checked by the code, since the
 * model may follow the story's language instead. Unknown language names and short texts pass. */
export function wrongLanguage(text: string, language: string): boolean {
  const wanted = LANGUAGE_NAMES[language.trim().toLowerCase()];
  if (!wanted) return false;
  const found = detectStoryLanguage(text);
  return found !== null && found !== wanted;
}

/** One part of the story: its text and which paragraphs it holds. */
export interface StoryPart {
  text: string;
  first: number;
  last: number;
}

/** The story in parts of about `max` tokens, cut between paragraphs. The same parts serve both
 * passes: the people pass reads each one, the notes pass reads the parts a person appears in —
 * whole parts rather than only the paragraphs that name them, because after "Irene Adler" the
 * story goes on with "she" and "the lady" (live test: with single paragraphs the notes missed
 * how her story ends). */
export function storyParts(paragraphs: string[], count: Count, max = STORY_PART_TOKENS): StoryPart[] {
  const parts: StoryPart[] = [];
  let first = 0;
  let size = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const n = count(paragraphs[i]);
    if (i > first && size + n > max) {
      parts.push({ text: paragraphs.slice(first, i).join("\n\n"), first, last: i - 1 });
      first = i;
      size = 0;
    }
    size += n;
  }
  if (first < paragraphs.length) parts.push({ text: paragraphs.slice(first).join("\n\n"), first, last: paragraphs.length - 1 });
  return parts;
}

/** The parts in which the person is mentioned (all parts for the narrator). */
export function partsWith(parts: StoryPart[], paragraphs: string[], person: StoryPerson, others: StoryPerson[]): StoryPart[] {
  const mentioned = paragraphsMentioning(paragraphs, person, others);
  return parts.filter((part) => mentioned.some((i) => i >= part.first && i <= part.last));
}

// ── The user's place in the story ───────────────────────────────────────────────────────────────

/** Who the user plays:
 *  - `new`: someone the story doesn't have — `joins` meets the characters for the first time,
 *    `always` has been there all along (the characters know them), `replaces` takes the place of
 *    a character from the story;
 *  - `plays`: one of the story's own characters. */
export type StoryUserRole =
  | { kind: "new"; mode: "joins" | "always"; about: string }
  | { kind: "new"; mode: "replaces"; about: string; person: string }
  | { kind: "plays"; person: string };

/** The story character who *is* {{user}} (and so gets no card), if any. */
export function userStoryPerson(role: StoryUserRole): string | null {
  if (role.kind === "plays") return role.person;
  if (role.mode === "replaces") return role.person;
  return null;
}
