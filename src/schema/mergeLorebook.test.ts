import { describe, expect, it } from "vitest";
import type { Lorebook, LorebookEntry } from "./lorebook";
import { mergeLorebook } from "./mergeLorebook";

const entry = (keys: string[], content: string, extra: Partial<LorebookEntry> = {}): LorebookEntry => ({
  keys,
  content,
  extensions: {},
  enabled: true,
  insertion_order: 0,
  ...extra,
});

describe("mergeLorebook", () => {
  const target: Lorebook = { name: "Main", scan_depth: 3, extensions: {}, entries: [entry(["Elara"], "The mother.", { id: 0 })] };

  it("appends new entries, keeps the target's settings and drops source ids", () => {
    const source: Lorebook = { name: "Other", extensions: {}, entries: [entry(["Harbor"], "A port.", { id: 0, position: "after_char" })] };
    const { book, added, skipped } = mergeLorebook(target, source);
    expect(book).toMatchObject({ name: "Main", scan_depth: 3 });
    expect(book.entries).toHaveLength(2);
    expect(book.entries[1]).toMatchObject({ keys: ["Harbor"], position: "after_char" });
    expect(book.entries[1].id).toBeUndefined();
    expect([added, skipped]).toEqual([1, 0]);
  });

  it("skips exact duplicates regardless of key order and case, also within the source", () => {
    const source: Lorebook = {
      extensions: {},
      entries: [entry(["elara"], " The mother. "), entry(["Brightwood", "Village"], "Home."), entry(["village", "BRIGHTWOOD"], "Home.")],
    };
    const { book, added, skipped } = mergeLorebook(target, source);
    expect([added, skipped]).toEqual([1, 2]);
    expect(book.entries.map((e) => e.keys[0])).toEqual(["Elara", "Brightwood"]);
  });

  it("keeps entries that only share a key but differ in content", () => {
    const source: Lorebook = { extensions: {}, entries: [entry(["Elara"], "A different Elara.")] };
    expect(mergeLorebook(target, source).added).toBe(1);
  });
});
