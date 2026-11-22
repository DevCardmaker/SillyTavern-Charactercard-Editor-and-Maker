import { describe, expect, it } from "vitest";
import { cardTextSpots, countMatches, findPattern, matchSnippets, replaceInCard } from "./findReplace";
import type { NormalizedCard } from "./normalize";

const card = {
  name: "Wendy",
  description: "Wendy works at the shack. Wendy's hat is green. Wendys are a band.",
  personality: "wendy is lazy.",
  scenario: "",
  first_mes: "*Wendy waves.* \"Hey, Dipper!\"",
  mes_example: "",
  system_prompt: "",
  post_history_instructions: "",
  creator_notes: "",
  alternate_greetings: ["Wendy laughs.", "Nothing here."],
  group_only_greetings: [],
  tags: [],
  extensions: {},
  character_book: { entries: [{ keys: ["Wendy", "Corduroy"], content: "Wendy's family.", comment: "Family", enabled: true, insertion_order: 0, extensions: {} }], extensions: {} },
} as unknown as NormalizedCard;

describe("findPattern", () => {
  it("finds whole words, also with 's, and ignores case unless asked", () => {
    const p = findPattern("Wendy", { matchCase: false, wholeWords: true })!;
    expect(countMatches(card.description, p)).toBe(2);
    expect(countMatches(card.personality, p)).toBe(1);
    expect(countMatches(card.personality, findPattern("Wendy", { matchCase: true, wholeWords: true })!)).toBe(0);
    expect(countMatches("Wendys", findPattern("Wendy", { matchCase: false, wholeWords: false })!)).toBe(1);
    expect(countMatches("Jürgen und Jürgens", findPattern("Jürgen", { matchCase: false, wholeWords: true })!)).toBe(1);
  });

  it("shows where it found something", () => {
    const [first] = matchSnippets("A long text before Wendy and after", findPattern("Wendy", { matchCase: false, wholeWords: true })!, 1, 6);
    expect(first).toEqual({ before: "…efore ", match: "Wendy", after: " and a…" });
  });
});

describe("replaceInCard", () => {
  const options = { matchCase: false, wholeWords: true };
  it("replaces in the chosen places only, lorebook keys one by one", () => {
    const ids = new Set(cardTextSpots(card, true).map((s) => s.id).filter((id) => id !== "personality"));
    const { patch, count } = replaceInCard(card, "Wendy", "{{char}}", options, ids);
    expect(patch.description).toBe("{{char}} works at the shack. {{char}}'s hat is green. Wendys are a band.");
    expect(patch.personality).toBeUndefined();
    expect(patch.first_mes).toBe('*{{char}} waves.* "Hey, Dipper!"');
    expect(patch.alternate_greetings).toEqual(["{{char}} laughs.", "Nothing here."]);
    expect(patch.character_book?.entries[0].keys).toEqual(["{{char}}", "Corduroy"]);
    expect(patch.character_book?.entries[0].content).toBe("{{char}}'s family.");
    expect(count).toBe(6);
  });

  it("writes $ signs in the replacement as they are", () => {
    const { patch } = replaceInCard(card, "Dipper", "$1 & $&", options, new Set(["first_mes"]));
    expect(patch.first_mes).toBe('*Wendy waves.* "Hey, $1 & $&!"');
  });
});
