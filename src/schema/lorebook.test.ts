import { describe, expect, it } from "vitest";
import { lorebookSchema, normalizeWorldInfo, toWorldInfo, type Lorebook } from "./lorebook";

const BOOK: Lorebook = {
  name: "Harbor Town",
  description: "Coastal setting",
  extensions: {},
  entries: [
    { keys: ["Harbor"], content: "Busy port.", extensions: {}, enabled: true, insertion_order: 100, comment: "Harbor" },
    { keys: ["Lighthouse"], content: "Old tower.", extensions: {}, enabled: false, insertion_order: 50, position: "after_char" },
  ],
};

function roundTrip(book: Lorebook): Lorebook {
  return lorebookSchema.parse(normalizeWorldInfo(JSON.parse(JSON.stringify(toWorldInfo(book)))));
}

describe("toWorldInfo", () => {
  it("writes SillyTavern's format with both naming styles", () => {
    const wi = toWorldInfo(BOOK) as { entries: Record<string, Record<string, unknown>> };
    expect(Object.keys(wi.entries)).toEqual(["0", "1"]);
    expect(wi.entries["1"]).toMatchObject({
      uid: 1,
      displayIndex: 1,
      key: ["Lighthouse"],
      keys: ["Lighthouse"],
      order: 50,
      insertion_order: 50,
      disable: true,
      enabled: false,
      position: 1,
      probability: 100,
    });
  });

  it("round-trips through normalizeWorldInfo without stale ST duplicates", () => {
    const back = roundTrip(BOOK);
    expect(back.entries.map((e) => [e.keys, e.content, e.enabled, e.insertion_order, e.position])).toEqual([
      [["Harbor"], "Busy port.", true, 100, "before_char"],
      [["Lighthouse"], "Old tower.", false, 50, "after_char"],
    ]);
    expect(back.entries[0]).not.toHaveProperty("key");
    expect(back.entries[0]).not.toHaveProperty("disable");
  });

  it("keeps a non-V2 ST position (e.g. @depth) unless the user picked a different one", () => {
    const imported = lorebookSchema.parse(
      normalizeWorldInfo({ entries: { "0": { uid: 0, key: ["Deep"], content: "x", position: 4 } } }),
    );
    const kept = toWorldInfo(imported) as { entries: Record<string, { position: number }> };
    expect(kept.entries["0"].position).toBe(4);

    const changed = { ...imported, entries: [{ ...imported.entries[0], position: "before_char" as const }] };
    const overridden = toWorldInfo(changed) as { entries: Record<string, { position: number; extensions: { position: number } }> };
    expect(overridden.entries["0"].position).toBe(0);
    expect(overridden.entries["0"].extensions.position).toBe(0);
  });

  it("uses the edited V2 values, not stale ones from an imported file", () => {
    const imported = lorebookSchema.parse(
      normalizeWorldInfo({ entries: { "0": { uid: 9, key: ["Old"], content: "x", order: 1, disable: false } } }),
    );
    const edited = { ...imported, entries: [{ ...imported.entries[0], keys: ["New"], enabled: false }] };
    const wi = toWorldInfo(edited) as { entries: Record<string, Record<string, unknown>> };
    expect(wi.entries["0"]).toMatchObject({ key: ["New"], keys: ["New"], disable: true, uid: 0 });
  });
});
