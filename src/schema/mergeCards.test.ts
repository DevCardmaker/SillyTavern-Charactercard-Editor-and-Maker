import { describe, expect, it } from "vitest";
import { buildMergeSceneSystemPrompt, buildMergeSceneUserTurn } from "./aiPrompt";
import { assembleMerged, joinNames, mergeCardLorebooks, mergeSections, replaceCharMacro } from "./mergeCards";
import { createBlankCard } from "./normalize";

const entry = (key: string, content: string) => ({ keys: [key], content, extensions: {}, enabled: true, insertion_order: 100 });
const lena = {
  ...createBlankCard(),
  name: "Lena",
  description: "{{char}} is 19. {{Char}} loves horses and {{user}}'s jokes.",
  character_book: { extensions: {}, entries: [entry("village", "A small village."), entry("bakery", "Ingrid's bakery.")] },
};
const tom = {
  ...createBlankCard(),
  name: "Tom",
  description: "{{char}} is 26, a carpenter.",
  personality: "Quiet, protective.",
  character_book: { extensions: {}, entries: [entry("village", "A small village."), entry("fire", "The fire brigade.")] },
};

describe("merging cards", () => {
  it("names each person instead of {{char}}, keeps {{user}}", () => {
    expect(replaceCharMacro(lena.description, "Lena")).toBe("Lena is 19. Lena loves horses and {{user}}'s jokes.");
  });

  it("builds an intro plus one section per person; personality only where there is one", () => {
    const { description, personality } = assembleMerged(mergeSections([lena, tom]));
    expect(description).toContain("portrays several characters: Lena and Tom");
    expect(description).toContain("## Lena\nLena is 19.");
    expect(description).toContain("## Tom\nTom is 26, a carpenter.");
    expect(personality).toBe("Tom: Quiet, protective.");
  });

  it("joins names readably", () => {
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("merges lorebooks without exact duplicates", () => {
    const book = mergeCardLorebooks([lena, tom]);
    expect(book?.entries.map((e) => e.keys[0])).toEqual(["village", "bakery", "fire"]);
    expect(mergeCardLorebooks([createBlankCard()])).toBeUndefined();
    expect(lena.character_book.entries).toHaveLength(2); // source untouched
  });
});

describe("merge scene prompt", () => {
  it("asks only for the chosen fields", () => {
    const both = buildMergeSceneSystemPrompt(["scenario", "first_mes"], ["Lena", "Tom"]);
    expect(both).toContain("- scenario:");
    expect(both).toContain("Never act or speak for {{user}}");
    expect(buildMergeSceneSystemPrompt(["first_mes"], ["Lena", "Tom"])).not.toContain("- scenario:");
  });

  it("passes a fixed scenario and the note", () => {
    const turn = buildMergeSceneUserTurn([lena, tom], "at the lake", "A summer evening.");
    expect(turn.content).toContain("A summer evening.");
    expect(turn.content).toContain("Note: at the lake");
  });
});
