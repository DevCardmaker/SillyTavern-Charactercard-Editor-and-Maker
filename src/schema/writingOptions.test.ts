import { describe, expect, it } from "vitest";
import { isEmptyField } from "./aiAssist";
import { createBlankCard } from "./normalize";
import { buildWritingNotes, fieldsWithLength, usesOpeningPov } from "./writingOptions";

const none = { all: "", fields: {} } as const;

describe("buildWritingNotes", () => {
  it("adds nothing unless something was picked", () => {
    expect(buildWritingNotes(["description", "first_mes"], none, "")).toEqual([]);
  });

  it("gives every selected field its own amount", () => {
    const notes = buildWritingNotes(["description", "mes_example"], { all: "short", fields: {} }, "");
    expect(notes).toEqual([
      expect.stringContaining("Description: aim for about 120 words"),
      expect.stringContaining("Example dialogue: aim for about 2 exchanges"),
    ]);
  });

  it("lets a field differ, also when nothing is picked for the rest", () => {
    const mixed = buildWritingNotes(["description", "personality"], { all: "short", fields: { personality: "long" } }, "");
    expect(mixed[1]).toContain("300 words");
    const single = buildWritingNotes(["description", "personality"], { all: "", fields: { personality: "long" } }, "");
    expect(single).toHaveLength(1);
  });

  it("ignores fields without a length", () => {
    expect(buildWritingNotes(["name", "tags"], { all: "long", fields: {} }, "")).toEqual([]);
    expect(fieldsWithLength(["name", "description", "tags"])).toEqual(["description"]);
  });

  it("only mentions the point of view when an opening is being written", () => {
    expect(buildWritingNotes(["description"], none, "first")).toEqual([]);
    expect(buildWritingNotes(["first_mes"], none, "first")[0]).toContain("first person");
    expect(buildWritingNotes(["alternate_greetings"], none, "third")[0]).toContain("third person");
    expect(usesOpeningPov(["first_mes"])).toBe(true);
    expect(usesOpeningPov(["name"])).toBe(false);
  });

  it("keeps the rule against acting for the user in every point of view", () => {
    for (const pov of ["first", "second", "third"] as const) {
      expect(buildWritingNotes(["first_mes"], none, pov)[0]).toMatch(/never (write|decide) what \{\{user\}\}/i);
    }
  });
});

describe("isEmptyField", () => {
  it("treats blank text and empty lists as empty", () => {
    const card = { ...createBlankCard(), name: "Anna", description: "  \n", tags: ["a"], alternate_greetings: [] };
    expect(isEmptyField(card, "name")).toBe(false);
    expect(isEmptyField(card, "description")).toBe(true);
    expect(isEmptyField(card, "tags")).toBe(false);
    expect(isEmptyField(card, "alternate_greetings")).toBe(true);
  });
});
