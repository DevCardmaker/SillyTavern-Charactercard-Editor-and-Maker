import { describe, expect, it } from "vitest";
import { compareCards, restoreAllPatch } from "./cardDiff";
import { createBlankCard, type NormalizedCard } from "./normalize";

const base = (patch: Partial<NormalizedCard> = {}): NormalizedCard => ({
  ...createBlankCard(),
  name: "Anna",
  description: "Tall",
  ...patch,
});
const entry = (patch: Record<string, unknown>) => ({
  keys: ["k"],
  content: "text",
  extensions: {},
  enabled: true,
  insertion_order: 0,
  ...patch,
});
const book = (entries: ReturnType<typeof entry>[]) =>
  ({ entries, extensions: {} }) as unknown as NormalizedCard["character_book"];

const keys = (old: NormalizedCard, now: NormalizedCard) => compareCards(old, now).map((c) => c.key);

describe("compareCards", () => {
  it("finds nothing in equal cards, whatever only differs in storage", () => {
    expect(compareCards(base(), base())).toEqual([]);
    expect(keys(base({ sourceSpec: "v2" }), base({ sourceSpec: "v3" }))).toEqual([]);
    expect(keys(base({ description: "a\r\nb" }), base({ description: "a\nb" }))).toEqual([]);
    expect(keys(base({ modification_date: 1 }), base({ modification_date: 2 }))).toEqual([]);
  });

  it("reports a changed field with both texts and the patch to bring it back", () => {
    const [change] = compareCards(base({ description: "Old" }), base({ description: "New" }));
    expect(change.text).toEqual({ before: "Old", after: "New" });
    expect(change.patch).toEqual({ description: "Old" });
  });

  it("shows deleting one greeting of several as one deletion", () => {
    const greetings = ["one", "two", "three"];
    const [change] = compareCards(base({ alternate_greetings: greetings }), base({ alternate_greetings: ["one", "three"] }));
    expect(change.items).toEqual([{ label: "Greeting", before: "two", after: undefined }]);
    expect(change.patch).toEqual({ alternate_greetings: greetings });
  });

  it("notices when only the order of greetings changed", () => {
    const [change] = compareCards(base({ alternate_greetings: ["a", "b"] }), base({ alternate_greetings: ["b", "a"] }));
    expect(change.items?.[0].label).toMatch(/Order/);
  });

  it("compares lorebook entries one by one", () => {
    const old = book([
      entry({ id: 1, comment: "Same" }),
      entry({ id: 2, comment: "Edited", content: "before" }),
      entry({ id: 3, comment: "Deleted" }),
    ]);
    const now = book([
      entry({ id: 1, comment: "Same" }),
      entry({ id: 2, comment: "Edited", content: "after" }),
      entry({ id: 4, comment: "Added" }),
    ]);
    const [change] = compareCards(base({ character_book: old }), base({ character_book: now }));
    expect(change.items).toEqual([
      { label: "Edited", before: "before", after: "after" },
      { label: "Deleted", before: "text" },
      { label: "Added", after: "text" },
    ]);
    expect(change.patch).toEqual({ character_book: old });
  });

  it("matches entries without ids by their label, and reports changed settings", () => {
    const old = book([entry({ comment: "Mother", enabled: true })]);
    const now = book([entry({ comment: "Mother", enabled: false })]);
    const [change] = compareCards(base({ character_book: old }), base({ character_book: now }));
    expect(change.items?.[0].label).toBe("Mother (settings)");
  });

  it("reports a lorebook that only exists on one side", () => {
    const only = book([entry({ comment: "A" })]);
    expect(compareCards(base({ character_book: only }), base())[0].items?.[0]).toEqual({ label: "A", before: "text" });
    expect(compareCards(base(), base({ character_book: only }))[0].patch).toEqual({ character_book: undefined });
  });

  it("includes the Character's Note and unknown fields, also ones the older version lacks", () => {
    const old = base({ extensions: { depth_prompt: { prompt: "note" } } });
    const now = base({ extensions: {}, future_field: "x" } as Partial<NormalizedCard>);
    const [change] = compareCards(old, now);
    expect(change.key).toBe("other");
    expect(change.text?.before).toContain("note");
    expect(change.patch).toMatchObject({ extensions: { depth_prompt: { prompt: "note" } } });
    expect("future_field" in change.patch).toBe(true);
    expect((change.patch as Record<string, unknown>).future_field).toBeUndefined();
  });

  it("restoring everything leaves no difference", () => {
    const old = base({
      description: "Old",
      tags: ["a"],
      alternate_greetings: ["hi"],
      character_book: book([entry({ comment: "A" })]),
      extensions: { depth_prompt: { prompt: "note" } },
    });
    const now = base({ description: "New", name: "Other", future_field: "x" } as Partial<NormalizedCard>);
    const restored = { ...now, ...restoreAllPatch(compareCards(old, now)) };
    expect(compareCards(old, restored)).toEqual([]);
  });
});

describe("group greetings", () => {
  it("get their own section, and the older list isn't reported as a second change", () => {
    const version = base({ group_only_greetings: ["a"], extensions: { group_greetings: ["a"] } });
    const current = base({ group_only_greetings: ["b"], extensions: { group_greetings: ["b"] } });
    const changes = compareCards(version, current);
    expect(changes.map((c) => c.key)).toEqual(["group_only_greetings"]);
    expect(changes[0].patch).toEqual({ group_only_greetings: ["a"] });
  });
});
