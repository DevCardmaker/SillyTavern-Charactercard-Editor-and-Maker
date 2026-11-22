import { describe, expect, it } from "vitest";
import { buildAiContext, contextPartText } from "./aiContext";
import type { NormalizedCard } from "./normalize";

const card = {
  name: "Anna",
  description: "A quiet librarian.",
  personality: "Shy, curious.",
  scenario: "",
  first_mes: "Hi.",
  mes_example: "",
  alternate_greetings: ["Hello!", " "],
  system_prompt: "",
  creator_notes: "",
  character_book: {
    entries: [
      { keys: ["Ben"], content: "Her brother.", comment: "Ben", enabled: true },
      { keys: ["Old"], content: "Switched off.", comment: "Old", enabled: false },
    ],
  },
} as unknown as NormalizedCard;

describe("buildAiContext", () => {
  it("joins the chosen parts that have text, in a fixed order", () => {
    expect(buildAiContext(card, ["personality", "name", "scenario"], null)).toBe("## Name\nAnna\n\n## Personality\nShy, curious.");
  });

  it("leaves out the field being edited", () => {
    expect(buildAiContext(card, ["name", "description"], null, "description")).toBe("## Name\nAnna");
  });

  it("lists enabled lorebook entries, numbered greetings and the persona", () => {
    expect(contextPartText(card, "lorebook", null)).toBe("- Ben: Her brother.");
    expect(contextPartText(card, "alternate_greetings", null)).toBe("(1) Hello!");
    expect(contextPartText(card, "persona", { name: "Max", description: "A traveller." })).toBe("Max ({{user}}): A traveller.");
    expect(contextPartText(card, "persona", null)).toBe("");
  });
});
