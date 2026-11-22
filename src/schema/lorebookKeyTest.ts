import type { Lorebook, LorebookEntry } from "./lorebook";

/** The global World Info settings that change how keys match. Defaults mirror a typical
 * SillyTavern setup: case-insensitive, whole words, recursion on. */
export interface KeyTestSettings {
  caseSensitive: boolean;
  matchWholeWords: boolean;
  recursive: boolean;
}

export const DEFAULT_KEY_TEST_SETTINGS: KeyTestSettings = {
  caseSensitive: false,
  matchWholeWords: true,
  recursive: true,
};

export type Activation =
  | { index: number; reason: "constant" }
  | { index: number; reason: "key"; key: string }
  | { index: number; reason: "recursion"; key: string; via: number };

export interface KeyTestResult {
  activations: Activation[];
  /** Activated entries that SillyTavern would still only insert by chance (probability < 100). */
  probabilities: Map<number, number>;
}

/** SillyTavern's selective logic for secondary keys. */
const AND_ANY = 0;
const NOT_ALL = 1;
const NOT_ANY = 2;
const AND_ALL = 3;

/** Per-entry options live in `extensions.*` in a card's lorebook (what ST's `convertCharacterBook`
 * reads) but directly on the entry in a World Info file — check both, entry level first. */
function option(entry: LorebookEntry, stName: string, extName: string): unknown {
  const direct = (entry as Record<string, unknown>)[stName];
  return direct ?? entry.extensions?.[extName];
}

function optBool(entry: LorebookEntry, stName: string, extName: string): boolean | undefined {
  const value = option(entry, stName, extName);
  return typeof value === "boolean" ? value : undefined;
}

/** Port of SillyTavern's `parseRegexFromString`: keys written as `/pattern/flags` are regexes. */
export function parseRegexKey(input: string): RegExp | null {
  const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
  if (!match) return null;
  let [, pattern] = match;
  const flags = match[2];
  if (pattern.match(/(^|[^\\])\//)) return null;
  pattern = pattern.replace("\\/", "/");
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A big lorebook (hundreds of entries, thousands of keys) checks every key against every entry's
// text — millions of checks for the recursion map. Each key is turned into a ready check once, and
// each text is lower-cased and split into words once; the answers stay exactly SillyTavern's.
type KeyCheck =
  | { kind: "regex"; regex: RegExp }
  | { kind: "word"; needle: string; caseSensitive: boolean }
  | { kind: "substring"; needle: string; caseSensitive: boolean }
  | { kind: "wholeWord"; needle: string; regex: RegExp; caseSensitive: boolean };

// One map per setting combination, so a lookup needs no new string.
const keyChecks = [new Map<string, KeyCheck>(), new Map<string, KeyCheck>(), new Map<string, KeyCheck>(), new Map<string, KeyCheck>()];
const lowerCased = new Map<string, string>();
const wordSets = new Map<string, Set<string>>();

function cached<K, V>(map: Map<K, V>, key: K, make: () => V, limit = 20000): V {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  if (map.size >= limit) map.clear();
  const value = make();
  map.set(key, value);
  return value;
}

function keyCheck(key: string, caseSensitive: boolean, matchWholeWords: boolean): KeyCheck {
  return cached(keyChecks[(caseSensitive ? 2 : 0) + (matchWholeWords ? 1 : 0)], key, (): KeyCheck => {
    const regex = parseRegexKey(key);
    if (regex) return { kind: "regex", regex };
    const needle = caseSensitive ? key : key.toLowerCase();
    if (!matchWholeWords || needle.split(/\s+/).length > 1) return { kind: "substring", needle, caseSensitive };
    // Word characters only ([A-Za-z0-9_]): a whole-word match is exactly "one of the text's words".
    if (/^\w+$/.test(needle)) return { kind: "word", needle, caseSensitive };
    return { kind: "wholeWord", needle, caseSensitive, regex: new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`) };
  });
}

/** Port of SillyTavern's `WorldInfoBuffer.matchKeys`. */
export function matchKey(haystack: string, key: string, caseSensitive: boolean, matchWholeWords: boolean): boolean {
  const check = keyCheck(key, caseSensitive, matchWholeWords);
  if (check.kind === "regex") {
    // A /g or /y regex remembers where it stopped; start over like a fresh one would.
    check.regex.lastIndex = 0;
    return check.regex.test(haystack);
  }
  const text = check.caseSensitive ? haystack : cached(lowerCased, haystack, () => haystack.toLowerCase(), 2000);
  if (check.kind === "word") return cached(wordSets, text, () => new Set(text.split(/\W+/)), 2000).has(check.needle);
  if (!text.includes(check.needle)) return false;
  return check.kind === "substring" || check.regex.test(text);
}

/** The first primary key that matches, or undefined — secondary keys and selective logic
 * included, exactly like ST's activation check. */
function matchEntry(entry: LorebookEntry, text: string, settings: KeyTestSettings): string | undefined {
  const caseSensitive = entry.case_sensitive ?? optBool(entry, "caseSensitive", "case_sensitive") ?? settings.caseSensitive;
  const wholeWords = optBool(entry, "matchWholeWords", "match_whole_words") ?? settings.matchWholeWords;
  const matches = (key: string) => key.trim() !== "" && matchKey(text, key.trim(), caseSensitive, wholeWords);

  const primary = entry.keys.find(matches);
  if (!primary) return undefined;

  const secondary = (entry.secondary_keys ?? []).filter((k) => k.trim() !== "");
  if (!entry.selective || secondary.length === 0) return primary;

  const logic = Number(option(entry, "selectiveLogic", "selectiveLogic") ?? AND_ANY);
  const hits = secondary.map(matches);
  const ok =
    logic === NOT_ALL
      ? hits.some((h) => !h)
      : logic === NOT_ANY
        ? hits.every((h) => !h)
        : logic === AND_ALL
          ? hits.every((h) => h)
          : hits.some((h) => h);
  return ok ? primary : undefined;
}

/** Which entries SillyTavern would activate for `text` (the scanned chat messages): constant
 * entries, key matches, and — with recursion on — entries triggered by the content of already
 * activated ones (respecting each entry's "exclude from / prevent further recursion"). Ignores
 * token budget, groups, timed effects and "delay until recursion": this answers "do my keys fire
 * when they should", not "what exactly ends up in the prompt". */
export function testKeys(book: Lorebook, text: string, settings: KeyTestSettings): KeyTestResult {
  const activations: Activation[] = [];
  const active = new Set<number>();

  book.entries.forEach((entry, index) => {
    if (!entry.enabled) return;
    if (entry.constant) {
      activations.push({ index, reason: "constant" });
      active.add(index);
      return;
    }
    const key = matchEntry(entry, text, settings);
    if (key) {
      activations.push({ index, reason: "key", key });
      active.add(index);
    }
  });

  if (settings.recursive) {
    // Each round scans the content of every entry activated so far; repeats until nothing new fires.
    let changed = true;
    while (changed) {
      changed = false;
      const sources = [...active].filter((i) => !optBool(book.entries[i], "preventRecursion", "prevent_recursion"));
      book.entries.forEach((entry, index) => {
        if (active.has(index) || !entry.enabled) return;
        if (optBool(entry, "excludeRecursion", "exclude_recursion")) return;
        for (const via of sources) {
          const key = matchEntry(entry, book.entries[via].content, settings);
          if (key) {
            activations.push({ index, reason: "recursion", key, via });
            active.add(index);
            changed = true;
            return;
          }
        }
      });
    }
  }

  const probabilities = new Map<number, number>();
  for (const index of active) {
    const entry = book.entries[index];
    const useProbability = optBool(entry, "useProbability", "useProbability") ?? true;
    const probability = Number(option(entry, "probability", "probability") ?? 100);
    if (useProbability && probability < 100) probabilities.set(index, probability);
  }

  return { activations, probabilities };
}

/** Keys used by more than one entry (case-insensitive) → the indices of those entries. Shared keys
 * are sometimes intended, but often a sign of two entries fighting over the same trigger. */
export function duplicateKeys(book: Lorebook): Map<number, string[]> {
  const byKey = new Map<string, Set<number>>();
  book.entries.forEach((entry, index) => {
    for (const key of entry.keys) {
      const normalized = key.trim().toLowerCase();
      if (!normalized) continue;
      if (!byKey.has(normalized)) byKey.set(normalized, new Set());
      byKey.get(normalized)!.add(index);
    }
  });

  const result = new Map<number, string[]>();
  for (const [key, indices] of byKey) {
    if (indices.size < 2) continue;
    for (const index of indices) result.set(index, [...(result.get(index) ?? []), key]);
  }
  return result;
}

/** One entry's content triggering another entry through its key (recursion). */
export interface RecursionLink {
  from: number;
  to: number;
  key: string;
  /** Set when SillyTavern wouldn't follow it: the source prevents further recursion, or the target
   * is excluded from recursion. */
  blockedBy?: "prevent" | "exclude";
}

export interface RecursionMap {
  links: RecursionLink[];
  /** Groups of entries that trigger each other in a loop (each group has two or more entries). */
  loops: number[][];
}

/** Which entries pull in which others through recursion — every pair where a key of one entry
 * appears in the content of another, with the same key rules as the key tester. Constant entries
 * are always in anyway, so nothing leads to them; disabled entries take no part. */
export function recursionMap(book: Lorebook, settings: KeyTestSettings): RecursionMap {
  const links: RecursionLink[] = [];
  // Index: which entries a single word can trigger. An entry with any other kind of primary key
  // (several words, a regex, special characters) is checked against every text instead. A target
  // is only checked in full (matchEntry, secondary keys included) when one of its keys can match.
  const byWord = new Map<string, number[]>();
  const always: number[] = [];
  book.entries.forEach((target, to) => {
    if (!target.enabled || target.constant) return;
    const caseSensitive = target.case_sensitive ?? optBool(target, "caseSensitive", "case_sensitive") ?? settings.caseSensitive;
    const wholeWords = optBool(target, "matchWholeWords", "match_whole_words") ?? settings.matchWholeWords;
    const checks = target.keys.filter((k) => k.trim()).map((k) => keyCheck(k.trim(), caseSensitive, wholeWords));
    if (checks.some((c) => c.kind !== "word")) {
      always.push(to);
      return;
    }
    for (const c of checks) {
      if (c.kind !== "word") continue;
      const slot = `${c.caseSensitive ? "1" : "0"}${c.needle}`;
      const list = byWord.get(slot);
      if (list) list.push(to);
      else byWord.set(slot, [to]);
    }
  });

  book.entries.forEach((source, from) => {
    if (!source.enabled || !source.content.trim()) return;
    const prevents = optBool(source, "preventRecursion", "prevent_recursion") === true;
    const candidates = new Set(always);
    for (const word of new Set(source.content.split(/\W+/))) byWord.get(`1${word}`)?.forEach((t) => candidates.add(t));
    for (const word of new Set(source.content.toLowerCase().split(/\W+/))) byWord.get(`0${word}`)?.forEach((t) => candidates.add(t));
    [...candidates].sort((a, b) => a - b).forEach((to) => {
      const target = book.entries[to];
      if (to === from) return;
      const key = matchEntry(target, source.content, settings);
      if (!key) return;
      const excluded = optBool(target, "excludeRecursion", "exclude_recursion") === true;
      links.push({ from, to, key, ...(prevents ? { blockedBy: "prevent" as const } : excluded ? { blockedBy: "exclude" as const } : {}) });
    });
  });
  return { links, loops: findLoops(book.entries.length, links.filter((l) => !l.blockedBy)) };
}

/** Strongly connected groups of two or more (Tarjan's algorithm). */
function findLoops(count: number, links: RecursionLink[]): number[][] {
  const next = Array.from({ length: count }, () => [] as number[]);
  for (const link of links) next[link.from].push(link.to);
  const index = new Array<number>(count).fill(-1);
  const low = new Array<number>(count).fill(0);
  const onStack = new Array<boolean>(count).fill(false);
  const stack: number[] = [];
  const loops: number[][] = [];
  let counter = 0;

  function visit(v: number) {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (const w of next[v]) {
      if (index[w] === -1) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      const group: number[] = [];
      let w: number;
      do {
        w = stack.pop() as number;
        onStack[w] = false;
        group.push(w);
      } while (w !== v);
      if (group.length > 1) loops.push(group.sort((a, b) => a - b));
    }
  }

  for (let v = 0; v < count; v++) if (index[v] === -1) visit(v);
  return loops;
}
