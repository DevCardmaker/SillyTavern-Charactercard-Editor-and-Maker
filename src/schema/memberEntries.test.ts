import { describe, expect, it } from "vitest";
import type { Lorebook } from "./lorebook";
import { groupLorebookFor, memberKeys, upsertMemberEntries, verbatimProfile } from "./memberEntries";
import { createBlankCard } from "./normalize";

const profiles = [
  { name: "Chloe Thompson", keys: ["Chloe Thompson", "Chloe"], content: "Chloe is the eldest." },
  { name: "Bonita", keys: ["Bonita"], content: "Bonita runs the bakery." },
  { name: "Kai", keys: ["Kai"], content: "Kai is the user's persona." },
];

describe("memberKeys", () => {
  it("always includes full and first name, deduplicated", () => {
    expect(memberKeys("Chloe Thompson", ["Chloe", "Clo"])).toEqual(["Chloe Thompson", "Chloe", "Clo"]);
    expect(memberKeys("Bonita", ["bonita", "Bo"])).toEqual(["Bonita", "Bo"]);
    expect(memberKeys("Al Smith", [])).toEqual(["Al Smith"]);
  });

  it("drops relationship-word keys the model keeps proposing", () => {
    expect(memberKeys("Mary", ["Mother Mary", "Mom", "Mare"])).toEqual(["Mary", "Mare"]);
    expect(memberKeys("Sarah", ["big sis", "große Schwester", "Sari"])).toEqual(["Sarah", "Sari"]);
  });
});

describe("verbatimProfile", () => {
  it("uses short card text word for word, with {{char}} resolved", () => {
    const card = { ...createBlankCard(), name: "Mary", description: "{{char}} (40, housewife)", personality: "Calm." };
    expect(verbatimProfile(card)).toBe("Mary (40, housewife)\nCalm.");
  });

  it("leaves long cards to the AI", () => {
    expect(verbatimProfile({ ...createBlankCard(), name: "Y", description: "x".repeat(401) })).toBeUndefined();
    expect(verbatimProfile({ ...createBlankCard(), name: "Y" })).toBeUndefined();
  });
});

describe("upsertMemberEntries", () => {
  it("updates an entry with the same label, keeping its other settings, and appends new ones", () => {
    const book: Lorebook = {
      extensions: {},
      entries: [{ keys: ["Old"], content: "old", comment: "chloe thompson", extensions: {}, enabled: true, insertion_order: 7 }],
    };
    const next = upsertMemberEntries(book, profiles.slice(0, 2));
    expect(next.entries).toHaveLength(2);
    expect(next.entries[0]).toMatchObject({ content: "Chloe is the eldest.", insertion_order: 7, comment: "Chloe Thompson" });
    expect(next.entries[1]).toMatchObject({ comment: "Bonita", enabled: true });
  });
});

describe("groupLorebookFor", () => {
  it("gives a card everyone's entry except its own, creating a lorebook if needed", () => {
    const book = groupLorebookFor({ ...createBlankCard(), name: "Bonita" }, profiles);
    expect(book.name).toBe("Bonita's Lorebook");
    expect(book.entries.map((e) => e.comment)).toEqual(["Chloe Thompson", "Kai"]);
  });

  it("keeps the card's existing entries", () => {
    const card = {
      ...createBlankCard(),
      name: "Kai2",
      character_book: { name: "Own", extensions: {}, entries: [{ keys: ["Harbor"], content: "A port.", extensions: {}, enabled: true, insertion_order: 0 }] },
    };
    expect(groupLorebookFor(card, profiles).entries.map((e) => e.comment ?? e.keys[0])).toEqual(["Harbor", "Chloe Thompson", "Bonita", "Kai"]);
  });
});
