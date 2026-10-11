import { describe, expect, it } from "vitest";
import { buildSplitMemberSystemPrompt, buildSplitMemberUserTurn, buildSplitPeopleSystemPrompt } from "./aiPrompt";
import { lorebookEntriesForSplit, parseAiSplitPeople, splitMemberWarning } from "./aiSplitGroup";
import { createBlankCard } from "./normalize";

const entry = (keys: string[], content: string, comment = "") => ({
  keys,
  content,
  comment,
  extensions: {},
  enabled: true,
  insertion_order: 100,
});

const group = {
  ...createBlankCard(),
  name: "Aria & Amelia",
  description: "x".repeat(2000),
  character_book: {
    extensions: {},
    entries: [
      entry(["Mother"], "Their mother Clara runs the mansion.", "Clara"),
      entry(["mansion"], "The mansion has 40 rooms. Aria guards the gate."),
      entry(["empty"], "  "),
    ],
  },
};

describe("parseAiSplitPeople", () => {
  it("drops duplicates, blanks and {{user}}", () => {
    const parsed = parseAiSplitPeople({
      people: [
        { name: "Aria", role: "older twin", source: "card" },
        { name: "aria ", role: "twin", source: "lorebook" },
        { name: " ", role: "", source: "card" },
        { name: "{{user}}", role: "master", source: "card" },
        { name: "Clara", role: "mother", source: "lorebook" },
      ],
    });
    expect(parsed.success && parsed.data.map((p) => p.name)).toEqual(["Aria", "Clara"]);
  });
});

describe("lorebookEntriesForSplit", () => {
  it("returns all non-empty entries, or only those mentioning a person", () => {
    expect(lorebookEntriesForSplit(group)).toHaveLength(2);
    expect(lorebookEntriesForSplit(group, "Clara").map((e) => e.comment)).toEqual(["Clara"]);
    expect(lorebookEntriesForSplit(group, "Aria Smith").map((e) => e.content)).toEqual([
      "The mansion has 40 rooms. Aria guards the gate.",
    ]);
    expect(lorebookEntriesForSplit(group, "Dr. Clara Vane").map((e) => e.comment)).toEqual(["Clara"]);
    expect(lorebookEntriesForSplit(group, "the mother").map((e) => e.comment)).toEqual(["Clara"]);
    expect(lorebookEntriesForSplit(group, "Dr. Keller")).toEqual([]);
    expect(lorebookEntriesForSplit(createBlankCard())).toEqual([]);
  });
});

describe("splitMemberWarning", () => {
  const member = (len: number) => ({ name: "A", description: "y".repeat(len), personality: "", scenario: "", first_mes: "" });

  it("flags cards far below the person's share, or longer than the whole group card", () => {
    expect(splitMemberWarning(group, member(300), 2)).toBe("short");
    expect(splitMemberWarning(group, member(900), 2)).toBeNull();
    expect(splitMemberWarning(group, member(2700), 2)).toBe("long");
    expect(splitMemberWarning({ ...group, description: "tiny" }, member(1), 2)).toBeNull();
  });
});

describe("split prompts", () => {
  it("lists people from card and lorebook, without {{user}}", () => {
    const prompt = buildSplitPeopleSystemPrompt();
    expect(prompt).toContain('"lorebook" if only the lorebook entries do');
    expect(prompt).toContain("Leave out {{user}}");
  });

  it("extracts one named person word for word", () => {
    const prompt = buildSplitMemberSystemPrompt("Aria", ["Amelia"]);
    expect(prompt).toContain("for ONE person: Aria");
    expect(prompt).toContain("The others (Amelia)");
    expect(prompt).toContain("word for word");
    expect(buildSplitMemberSystemPrompt("Aria", [])).not.toContain("The others");
  });

  it("sends lorebook entries only when there are some", () => {
    expect(buildSplitMemberUserTurn(group, lorebookEntriesForSplit(group, "Clara")).content).toContain("Lorebook entries");
    expect(buildSplitMemberUserTurn(group, []).content).not.toContain("Lorebook entries");
  });
});
