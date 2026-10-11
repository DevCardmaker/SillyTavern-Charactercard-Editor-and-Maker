import { describe, expect, it } from "vitest";
import { applySnippet } from "./aiConsistencyFix";
import { additionsToChanges, lastSentence, parseAiIntegration } from "./aiIntegrateMembers";
import { createBlankCard } from "./normalize";

const lena = {
  id: "lena",
  card: { ...createBlankCard(), name: "Lena", description: "She grew up in a village. Her brother Tom is 26. She visits every weekend." },
};

describe("additionsToChanges", () => {
  it("inserts after the quoted sentence", () => {
    const [change] = additionsToChanges(
      [{ character: "Lena", field: "description", after: "Her brother Tom is 26.", add: "Her aunt Helga teaches." }],
      [lena],
    );
    expect(change.problem).toBeUndefined();
    expect(applySnippet(lena.card.description, change.find, change.replace)).toBe(
      "She grew up in a village. Her brother Tom is 26. Her aunt Helga teaches. She visits every weekend.",
    );
  });

  it("appends at the end when the quote doesn't match (model paraphrased)", () => {
    const [change] = additionsToChanges(
      [{ character: "lena", field: "description", after: "Lena grew up in a village.", add: "Her aunt Helga teaches." }],
      [lena],
    );
    expect(change.slotId).toBe("lena");
    expect(applySnippet(lena.card.description, change.find, change.replace)).toBe(
      "She grew up in a village. Her brother Tom is 26. She visits every weekend. Her aunt Helga teaches.",
    );
  });

  it("flags unknown characters and empty fields, drops empty additions", () => {
    const changes = additionsToChanges(
      [
        { character: "Helga", field: "description", after: "", add: "x" },
        { character: "Lena", field: "scenario", after: "", add: "x" },
        { character: "Lena", field: "description", after: "", add: "  " },
      ],
      [lena],
    );
    expect(changes).toHaveLength(2);
    expect(changes[0].problem).toContain("No reference card");
    expect(changes[1].problem).toContain("empty");
  });
});

describe("lastSentence / parse", () => {
  it("finds the last sentence", () => {
    expect(lastSentence("One. Two! Three?")).toBe("Three?");
    expect(lastSentence("no break")).toBe("no break");
  });

  it("rejects first_mes as a field", () => {
    expect(parseAiIntegration({ explanation: "", additions: [{ character: "a", field: "first_mes", after: "", add: "x" }] }).success).toBe(false);
  });
});
