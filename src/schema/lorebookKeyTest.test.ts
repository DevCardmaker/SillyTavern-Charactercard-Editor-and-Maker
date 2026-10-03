import { describe, expect, it } from "vitest";
import type { Lorebook, LorebookEntry } from "./lorebook";
import { DEFAULT_KEY_TEST_SETTINGS as DEFAULTS, duplicateKeys, matchKey, testKeys } from "./lorebookKeyTest";

function entry(keys: string[], content = "", extra: Partial<LorebookEntry> = {}): LorebookEntry {
  return { keys, content, extensions: {}, enabled: true, insertion_order: 0, ...extra };
}

function book(...entries: LorebookEntry[]): Lorebook {
  return { entries, extensions: {} };
}

describe("matchKey", () => {
  it("matches whole words only, ignoring case, by default", () => {
    expect(matchKey("Elara waved.", "elara", false, true)).toBe(true);
    expect(matchKey("Elara waved.", "Ela", false, true)).toBe(false);
    expect(matchKey("Elara waved.", "Ela", false, false)).toBe(true);
  });

  it("matches multi-word keys as substrings even with whole words on", () => {
    expect(matchKey("the old harbor town", "harbor town", false, true)).toBe(true);
  });

  it("respects case sensitivity", () => {
    expect(matchKey("elara", "Elara", true, true)).toBe(false);
  });

  it("treats /pattern/flags keys as regexes", () => {
    expect(matchKey("Mother Elara", "/moth(er)?/i", false, true)).toBe(true);
    expect(matchKey("Elara", "/^Ela/", false, true)).toBe(true);
  });
});

describe("testKeys", () => {
  it("activates constant entries and key matches, skips disabled ones", () => {
    const result = testKeys(
      book(entry([], "World rules", { constant: true }), entry(["Elara"]), entry(["Elara"], "", { enabled: false })),
      "I talk to Elara.",
      DEFAULTS,
    );
    expect(result.activations).toEqual([
      { index: 0, reason: "constant" },
      { index: 1, reason: "key", key: "Elara" },
    ]);
  });

  it("applies selective logic to secondary keys", () => {
    const and = entry(["Elara"], "", { selective: true, secondary_keys: ["garden"] });
    expect(testKeys(book(and), "Elara is here", DEFAULTS).activations).toHaveLength(0);
    expect(testKeys(book(and), "Elara is in the garden", DEFAULTS).activations).toHaveLength(1);

    const notAny = entry(["Elara"], "", { selective: true, secondary_keys: ["garden"], extensions: { selectiveLogic: 2 } });
    expect(testKeys(book(notAny), "Elara is in the garden", DEFAULTS).activations).toHaveLength(0);
  });

  it("ignores secondary keys when the entry isn't selective, like ST", () => {
    const e = entry(["Elara"], "", { selective: false, secondary_keys: ["garden"] });
    expect(testKeys(book(e), "Elara", DEFAULTS).activations).toHaveLength(1);
  });

  it("follows recursion through activated content, honouring exclude/prevent", () => {
    const b = book(entry(["Elara"], "Elara lives in Brightwood."), entry(["Brightwood"], "A village."));
    expect(testKeys(b, "Elara", DEFAULTS).activations[1]).toEqual({
      index: 1,
      reason: "recursion",
      key: "Brightwood",
      via: 0,
    });
    expect(testKeys(b, "Elara", { ...DEFAULTS, recursive: false }).activations).toHaveLength(1);

    const prevented = book(entry(["Elara"], "Brightwood", { extensions: { prevent_recursion: true } }), entry(["Brightwood"]));
    expect(testKeys(prevented, "Elara", DEFAULTS).activations).toHaveLength(1);

    const excluded = book(entry(["Elara"], "Brightwood"), entry(["Brightwood"], "", { extensions: { exclude_recursion: true } }));
    expect(testKeys(excluded, "Elara", DEFAULTS).activations).toHaveLength(1);
  });

  it("reads per-entry options from World Info fields too", () => {
    const e = entry(["Ela"], "", { matchWholeWords: false } as Partial<LorebookEntry>);
    expect(testKeys(book(e), "Elara", DEFAULTS).activations).toHaveLength(1);
  });

  it("reports probabilities below 100", () => {
    const e = entry(["Elara"], "", { extensions: { probability: 40 } });
    expect(testKeys(book(e), "Elara", DEFAULTS).probabilities.get(0)).toBe(40);
  });
});

describe("duplicateKeys", () => {
  it("finds keys shared by several entries, case-insensitively", () => {
    const dupes = duplicateKeys(book(entry(["Mother", "Elara"]), entry(["mother"]), entry(["Brightwood"])));
    expect(dupes.get(0)).toEqual(["mother"]);
    expect(dupes.get(1)).toEqual(["mother"]);
    expect(dupes.has(2)).toBe(false);
  });
});
