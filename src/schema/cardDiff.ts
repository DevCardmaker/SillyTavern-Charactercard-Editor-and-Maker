import type { NormalizedCard } from "./normalize";

/** What differs between an older version of a card and its current state. Each section carries
 * the patch that brings the older state back, so restoring one section is the same operation as
 * restoring all of them. */
export interface CardListItem {
  label: string;
  /** Text in the older version; missing if the item only exists now. */
  before?: string;
  /** Text now; missing if the item only exists in the older version. */
  after?: string;
}

export interface CardChange {
  key: string;
  label: string;
  /** Set for a single text field, or for data shown as text. */
  text?: { before: string; after: string };
  /** Set for lists with separate items: greetings and lorebook entries. */
  items?: CardListItem[];
  patch: Partial<NormalizedCard>;
}

const TEXT_FIELDS: { key: keyof NormalizedCard; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "personality", label: "Personality" },
  { key: "scenario", label: "Scenario" },
  { key: "first_mes", label: "First message" },
  { key: "mes_example", label: "Example dialogue" },
  { key: "system_prompt", label: "System prompt" },
  { key: "post_history_instructions", label: "Post-history instructions" },
  { key: "creator_notes", label: "Creator notes" },
  { key: "creator", label: "Creator" },
  { key: "character_version", label: "Character version" },
];

/** `sourceSpec` is how the file was stored, the dates change with every save: neither is an edit. */
const NOT_COMPARED = new Set(["sourceSpec", "creation_date", "modification_date"]);

const HANDLED = new Set<string>([
  ...TEXT_FIELDS.map((f) => String(f.key)),
  "alternate_greetings",
  "tags",
  "character_book",
  ...NOT_COMPARED,
]);

/** A missing field and an empty one are the same, and so are Windows and Unix line endings. */
const cleanText = (value: unknown): string => (typeof value === "string" ? value.replace(/\r\n/g, "\n") : "");

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON with sorted keys and without empty values, so only real differences count as one. */
function stableJson(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (!isObject(v)) return v;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) {
      if (v[key] !== undefined) out[key] = sorted(v[key]);
    }
    return out;
  };
  return JSON.stringify(sorted(value), null, 2) ?? "";
}

/** Text that exists only on one side, paired up in order into edits; the rest stays added/removed.
 * So deleting one greeting of five shows one deletion, not four edits. */
function compareTexts(before: string[], after: string[], labelOf: (index: number) => string): CardListItem[] {
  const remaining = [...after];
  const removed: string[] = [];
  for (const text of before) {
    const index = remaining.indexOf(text);
    if (index >= 0) remaining.splice(index, 1);
    else removed.push(text);
  }
  const count = Math.max(removed.length, remaining.length);
  return Array.from({ length: count }, (_, i) => ({ label: labelOf(i), before: removed[i], after: remaining[i] }));
}

type BookEntry = NonNullable<NormalizedCard["character_book"]>["entries"][number];

function entryLabel(entry: BookEntry): string {
  return entry.comment?.trim() || entry.keys.filter(Boolean).join(", ") || "Unnamed entry";
}

/** Entries belong together by id if they have one, otherwise by what they're called. */
function compareEntries(before: BookEntry[], after: BookEntry[]): CardListItem[] {
  const identity = (entry: BookEntry) =>
    entry.id !== undefined && entry.id !== null ? `id:${String(entry.id)}` : `name:${entryLabel(entry)}`;
  const unmatched = new Map<string, BookEntry[]>();
  for (const entry of after) unmatched.set(identity(entry), [...(unmatched.get(identity(entry)) ?? []), entry]);

  const items: CardListItem[] = [];
  for (const old of before) {
    const now = unmatched.get(identity(old))?.shift();
    if (!now) {
      items.push({ label: entryLabel(old), before: cleanText(old.content) });
    } else if (cleanText(old.content) !== cleanText(now.content)) {
      items.push({ label: entryLabel(now), before: cleanText(old.content), after: cleanText(now.content) });
    } else if (stableJson(old) !== stableJson(now)) {
      items.push({ label: `${entryLabel(now)} (settings)`, before: stableJson(old), after: stableJson(now) });
    }
  }
  for (const rest of unmatched.values()) {
    for (const now of rest) items.push({ label: entryLabel(now), after: cleanText(now.content) });
  }
  return items;
}

function compareBooks(version: NormalizedCard, current: NormalizedCard): CardChange | null {
  const before = version.character_book;
  const after = current.character_book;
  if (stableJson(before ?? null) === stableJson(after ?? null)) return null;

  const items = compareEntries(before?.entries ?? [], after?.entries ?? []);
  const settings = (book: typeof before) => stableJson(book ? { ...book, entries: undefined } : {});
  if (before && after && settings(before) !== settings(after)) {
    items.unshift({ label: "Lorebook settings", before: settings(before), after: settings(after) });
  }
  if (items.length === 0) items.push({ label: before && after ? "Order of the entries changed" : "An empty lorebook" });
  return { key: "character_book", label: "Lorebook", items, patch: { character_book: before } };
}

function compareGreetings(version: NormalizedCard, current: NormalizedCard): CardChange | null {
  const before = version.alternate_greetings.map(cleanText);
  const after = current.alternate_greetings.map(cleanText);
  if (stableJson(before) === stableJson(after)) return null;
  const items = compareTexts(before, after, () => "Greeting");
  if (items.length === 0) items.push({ label: "Order of the greetings changed" });
  return { key: "alternate_greetings", label: "Alternate greetings", items, patch: { alternate_greetings: version.alternate_greetings } };
}

/** Sections that differ, in the order they appear in the editor. Everything the sections don't
 * name — the Character's Note, extensions, fields of newer card formats — is collected in one more,
 * so that a restored version never silently keeps parts of the current one. */
export function compareCards(version: NormalizedCard, current: NormalizedCard): CardChange[] {
  const changes: CardChange[] = [];

  for (const { key, label } of TEXT_FIELDS) {
    const before = cleanText(version[key]);
    const after = cleanText(current[key]);
    if (before !== after) {
      changes.push({ key: String(key), label, text: { before, after }, patch: { [key]: version[key] ?? "" } });
    }
  }

  const greetings = compareGreetings(version, current);
  if (greetings) changes.push(greetings);

  if (stableJson(version.tags) !== stableJson(current.tags)) {
    changes.push({
      key: "tags",
      label: "Tags",
      text: { before: version.tags.join("\n"), after: current.tags.join("\n") },
      patch: { tags: version.tags },
    });
  }

  const book = compareBooks(version, current);
  if (book) changes.push(book);

  const otherOf = (card: NormalizedCard) =>
    Object.fromEntries(Object.entries(card).filter(([key]) => !HANDLED.has(key)));
  const otherBefore = otherOf(version);
  const otherAfter = otherOf(current);
  if (stableJson(otherBefore) !== stableJson(otherAfter)) {
    const cleared = Object.fromEntries(Object.keys(otherAfter).map((key) => [key, undefined]));
    changes.push({
      key: "other",
      label: "Other data (Character's Note, extensions…)",
      text: { before: stableJson(otherBefore), after: stableJson(otherAfter) },
      patch: { ...cleared, ...otherBefore } as Partial<NormalizedCard>,
    });
  }

  return changes;
}

/** Everything needed to bring the older version back completely. */
export function restoreAllPatch(changes: CardChange[]): Partial<NormalizedCard> {
  return Object.assign({}, ...changes.map((change) => change.patch));
}
