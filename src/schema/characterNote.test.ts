import { describe, expect, it } from "vitest";
import { characterNotePatch, getCharacterNote } from "./characterNote";
import { createBlankCard } from "./normalize";

describe("character note", () => {
  it("falls back to SillyTavern's defaults", () => {
    expect(getCharacterNote(createBlankCard())).toEqual({ prompt: "", depth: 4, role: "system" });
    const odd = { ...createBlankCard(), extensions: { depth_prompt: { prompt: 3, depth: "x", role: "narrator" } } };
    expect(getCharacterNote(odd)).toEqual({ prompt: "", depth: 4, role: "system" });
  });

  it("patches only the given part and keeps other extensions", () => {
    const card = { ...createBlankCard(), extensions: { world: "Harbor", depth_prompt: { prompt: "Stay grumpy.", depth: 2, role: "user" } } };
    expect(characterNotePatch(card, { depth: 0 }).extensions).toEqual({
      world: "Harbor",
      depth_prompt: { prompt: "Stay grumpy.", depth: 0, role: "user" },
    });
  });
});
