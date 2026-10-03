import { describe, expect, it } from "vitest";
import type { Lorebook } from "./lorebook";
import { createBlankCard, type NormalizedCard } from "./normalize";
import { entryMatches, sameLorebook, shareStatus, sharedBookPatch, sharedNameForCard } from "./sharedLorebook";

const BOOK: Lorebook = {
  name: "Harbor Town",
  extensions: {},
  entries: [
    {
      keys: ["Harbor", "Port"],
      secondary_keys: ["ship"],
      content: "Busy port.",
      extensions: {},
      enabled: true,
      insertion_order: 100,
      comment: "The Harbor",
    },
  ],
};

function card(patch: Partial<NormalizedCard> = {}): NormalizedCard {
  return { ...createBlankCard(), name: "Mara", ...patch };
}

describe("shareStatus", () => {
  it("is unlinked without extensions.world", () => {
    expect(shareStatus(card({ character_book: BOOK }), BOOK)).toBe("unlinked");
  });

  it("is other when linked to a different lorebook name", () => {
    expect(shareStatus(card({ extensions: { world: "Elsewhere" } }), BOOK)).toBe("other");
  });

  it("is synced when linked and the embedded copy matches, regardless of key order", () => {
    const reordered = JSON.parse(JSON.stringify({ entries: BOOK.entries, extensions: {}, name: BOOK.name }));
    expect(shareStatus(card({ extensions: { world: "Harbor Town" }, character_book: reordered }), BOOK)).toBe("synced");
  });

  it("is outdated when linked but the embedded copy differs or is missing", () => {
    const changed = { ...BOOK, entries: [{ ...BOOK.entries[0], content: "Quiet port." }] };
    expect(shareStatus(card({ extensions: { world: "Harbor Town" }, character_book: changed }), BOOK)).toBe("outdated");
    expect(shareStatus(card({ extensions: { world: "Harbor Town" } }), BOOK)).toBe("outdated");
  });
});

describe("sharedBookPatch", () => {
  it("embeds an independent copy and links by name, keeping other extensions", () => {
    const target = card({ extensions: { talkativeness: "0.5" } });
    const patch = sharedBookPatch(target, BOOK);
    expect(patch.extensions).toEqual({ talkativeness: "0.5", world: "Harbor Town" });
    expect(sameLorebook(patch.character_book, BOOK)).toBe(true);
    expect(patch.character_book).not.toBe(BOOK);
    expect(shareStatus({ ...target, ...patch }, BOOK)).toBe("synced");
  });
});

describe("sharedNameForCard", () => {
  it("prefers the existing link, then the book name, then SillyTavern's default", () => {
    expect(sharedNameForCard(card({ extensions: { world: "Linked" }, character_book: BOOK }))).toBe("Linked");
    expect(sharedNameForCard(card({ character_book: BOOK }))).toBe("Harbor Town");
    expect(sharedNameForCard(card({ character_book: { ...BOOK, name: "  " } }))).toBe("Mara's Lorebook");
  });
});

describe("entryMatches", () => {
  const [entry] = BOOK.entries;

  it("matches label, keys, secondary keys and content case-insensitively", () => {
    for (const q of ["the harbor", "PORT", "Ship", "busy"]) expect(entryMatches(entry, q)).toBe(true);
    expect(entryMatches(entry, "lighthouse")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(entryMatches(entry, "  ")).toBe(true);
  });
});
