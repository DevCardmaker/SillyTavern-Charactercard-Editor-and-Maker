import { describe, expect, it } from "vitest";
import {
  buildGroupSceneSystemPrompt,
  buildGroupSceneUserTurn,
  groupScenePatch,
  parseAiGroupScene,
  resolveGroupScene,
} from "./aiGroupScene";
import { createBlankCard } from "./normalize";

const msg = (character: string, text: string) => ({ character, text });

describe("parseAiGroupScene", () => {
  it("reads messages and rejects anything else", () => {
    expect(parseAiGroupScene({ messages: [msg("A", "x")] })).toEqual({ success: true, data: [msg("A", "x")] });
    expect(parseAiGroupScene({ scene: "x" }).success).toBe(false);
  });
});

describe("prompts", () => {
  it("asks for the length and only a picked point of view", () => {
    const plain = buildGroupSceneSystemPrompt("short", "");
    expect(plain).toContain("about 50 words");
    expect(plain).not.toContain("first person");
    expect(buildGroupSceneSystemPrompt("long", "first")).toContain("first person");
  });

  it("names the characters, the situation and a persona if there is one", () => {
    const summary = { name: "Lena", description: "", personality: "", scenario: "", first_mes: "" };
    const { content } = buildGroupSceneUserTurn([summary], " A storm. ", { name: "Tom", description: "A sailor." });
    expect(content).toContain('"name": "Lena"');
    expect(content).toContain("{{user}} is Tom: A sailor.");
    expect(content).toContain("What happens: A storm.");
    expect(buildGroupSceneUserTurn([summary], "x").content).not.toContain("{{user}} is");
  });
});

describe("resolveGroupScene", () => {
  it("sorts by name, not by position", () => {
    const { texts, missing } = resolveGroupScene(["Lena", "Tom"], [msg("tom", "B"), msg("Lena", "A")]);
    expect(texts).toEqual(["A", "B"]);
    expect(missing).toEqual([]);
  });

  it("reports who was left out and ignores people who aren't there", () => {
    const { texts, missing } = resolveGroupScene(["Lena", "Tom"], [msg("Lena", "A"), msg("Bob", "C"), msg("Tom", "  ")]);
    expect(texts).toEqual(["A", ""]);
    expect(missing).toEqual(["Tom"]);
  });

  it("accepts a longer name and joins two messages of one character", () => {
    expect(resolveGroupScene(["Lena"], [msg("Lena Schmidt", "A"), msg("Lena", "B")]).texts).toEqual(["A\n\nB"]);
  });

  it("removes the speaker's name in front of the text", () => {
    expect(resolveGroupScene(["Lena"], [msg("Lena", "Lena: Hi")]).texts).toEqual(["Hi"]);
    expect(resolveGroupScene(["Lena"], [msg("Lena", "**Lena:** Hi")]).texts).toEqual(["Hi"]);
    expect(resolveGroupScene(["Lena"], [msg("Lena", "Lena lacht.")]).texts).toEqual(["Lena lacht."]);
  });

  it("turns the persona's name into the macro, whole words only", () => {
    const { texts } = resolveGroupScene(["Lena"], [msg("Lena", "Hallo Jörg! Und Jörgen auch.")], "Jörg");
    expect(texts).toEqual(["Hallo {{user}}! Und Jörgen auch."]);
  });
});

describe("groupScenePatch", () => {
  const card = { ...createBlankCard(), group_only_greetings: ["old", " "], creator_notes: "By me." };

  it("replaces or adds the greeting", () => {
    expect(groupScenePatch(card, "new", ["A", "B"], true).group_only_greetings).toEqual(["new"]);
    expect(groupScenePatch(card, "new", ["A", "B"], false).group_only_greetings).toEqual(["old", "new"]);
  });

  it("adds the order to the Creator's Notes and replaces an earlier one", () => {
    const first = groupScenePatch(card, "x", ["A", "B"], true).creator_notes;
    expect(first.startsWith("By me.\n\nGroup chat order in SillyTavern, top to bottom: A, B.")).toBe(true);
    const second = groupScenePatch({ ...card, creator_notes: first }, "x", ["B", "A"], true).creator_notes;
    expect(second).toContain("top to bottom: B, A.");
    expect(second).not.toContain("A, B.");
    expect(second.startsWith("By me.\n\nGroup chat")).toBe(true);
  });

  it("writes only the note into empty Creator's Notes", () => {
    const notes = groupScenePatch(createBlankCard(), "x", ["A"], true).creator_notes;
    expect(notes.startsWith("Group chat order")).toBe(true);
  });
});
