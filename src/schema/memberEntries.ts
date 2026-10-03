import { cleanAiKeys } from "./aiLorebookAssist";
import type { Lorebook, LorebookEntry } from "./lorebook";
import type { NormalizedCard } from "./normalize";

/** Relationship words (English and German). The local model keeps proposing keys like "Mom" or
 * "big sister" despite being told not to — and such a key would fire on every mention of anyone's
 * mother, so they're filtered here in code instead of relying on the prompt. */
const RELATIONSHIP_WORD =
  /\b(mom|mommy|mum|mother|ma|dad|daddy|father|pa|sis|sister|bro|brother|sibling|aunt|auntie|uncle|cousin|grandma|grandmother|granny|grandpa|grandfather|wife|husband|son|daughter|niece|nephew|mama|mutti|mutter|papa|vati|vater|schwester|bruder|tante|onkel|cousine|oma|opa|ehefrau|ehemann|sohn|tochter|nichte|neffe)\b/i;

/** Keys for a member's entry: always the full name and the first name (if the name has several
 * words and the first one is distinctive enough), plus the AI's nicknames minus relationship words. */
export function memberKeys(name: string, aiKeys: string[]): string[] {
  const full = name.trim();
  const first = full.split(/\s+/)[0];
  const base = full.includes(" ") && first.length >= 3 ? [full, first] : [full];
  return cleanAiKeys([...base, ...aiKeys.filter((k) => !RELATIONSHIP_WORD.test(k))]);
}

/** Up to this many characters, a member's card text is used as their profile word for word: the
 * local model can't summarize a one-liner like "Mother Mary (40, housewife)" without padding it
 * with invented details, so short cards skip the AI entirely. */
export const VERBATIM_PROFILE_MAX_CHARS = 400;

/** The card's own text as a profile, if it's short enough — with {{char}} replaced by the name,
 * because in another member's prompt SillyTavern would resolve {{char}} to the *replying*
 * character. Returns undefined for long cards, which get an AI summary instead. */
export function verbatimProfile(card: NormalizedCard): string | undefined {
  const parts = [card.description.trim(), card.personality.trim()].filter(Boolean);
  const text = parts.join("\n");
  if (text === "" || text.length > VERBATIM_PROFILE_MAX_CHARS) return undefined;
  return text.replace(/\{\{char\}\}/gi, card.name);
}

/** {{char}} in AI output gets the same treatment as in verbatim profiles. */
export function resolveCharMacro(text: string, name: string): string {
  return text.replace(/\{\{char\}\}/gi, name);
}

export interface MemberProfile {
  /** Character or persona name — also the entry's label, which is how an existing entry is found. */
  name: string;
  keys: string[];
  content: string;
}

function sameLabel(entry: LorebookEntry, name: string): boolean {
  return (entry.comment ?? "").trim().toLowerCase() === name.trim().toLowerCase();
}

/** Adds one entry per profile, or updates the existing entry with the same label (keys and
 * content; everything else about it, e.g. its position, is kept). */
export function upsertMemberEntries(book: Lorebook, profiles: MemberProfile[]): Lorebook {
  const entries = [...book.entries];
  for (const profile of profiles) {
    const fields = { keys: profile.keys, content: profile.content, comment: profile.name };
    const index = entries.findIndex((e) => sameLabel(e, profile.name));
    if (index >= 0) entries[index] = { ...entries[index], ...fields };
    else entries.push({ ...fields, extensions: {}, enabled: true, insertion_order: 0 });
  }
  return { ...book, entries };
}

/** The lorebook a group member's card gets: its own lorebook (or a new one, named the way
 * SillyTavern names an imported card's lorebook) plus an entry for every *other* member — SillyTavern
 * group chats only send the replying character's own card, so this is how members know each other. */
export function groupLorebookFor(card: NormalizedCard, profiles: MemberProfile[]): Lorebook {
  const own = card.character_book ?? { name: `${card.name}'s Lorebook`, entries: [], extensions: {} };
  const others = profiles.filter((p) => p.name.trim().toLowerCase() !== card.name.trim().toLowerCase());
  return upsertMemberEntries(own, others);
}
