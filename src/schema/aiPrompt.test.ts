import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./aiPrompt";

describe("buildSystemPrompt", () => {
  it("lists every selected field", () => {
    const prompt = buildSystemPrompt(["name", "scenario"]);
    expect(prompt).toMatch(/- name: Name/);
    expect(prompt).toMatch(/- scenario: Scenario/);
  });

  it("adds an appearance/background checklist for the description field", () => {
    const prompt = buildSystemPrompt(["description"]);
    expect(prompt).toMatch(/physical appearance/i);
    expect(prompt).toMatch(/clothing/i);
  });

  it("asks description's background to be one formative experience, not a neutral biography", () => {
    const prompt = buildSystemPrompt(["description"]);
    expect(prompt).toMatch(/formative experience/i);
  });

  it("adds a likes/quirks/kinks/secrets checklist for the personality field", () => {
    const prompt = buildSystemPrompt(["personality"]);
    expect(prompt).toMatch(/likes, dislikes/i);
    expect(prompt).toMatch(/secrets/i);
    expect(prompt).toMatch(/kinks/i);
  });

  it("asks personality to causally link at least one trait/quirk/fear to a past event", () => {
    const prompt = buildSystemPrompt(["personality"]);
    expect(prompt).toMatch(/causal link/i);
  });

  it("gives fields without a checklist entry no extra guidance line", () => {
    const prompt = buildSystemPrompt(["first_mes"]);
    expect(prompt).not.toMatch(/physical appearance/i);
    expect(prompt).not.toMatch(/kinks/i);
  });

  it("includes both checklists when both fields are selected", () => {
    const prompt = buildSystemPrompt(["description", "personality"]);
    expect(prompt).toMatch(/physical appearance/i);
    expect(prompt).toMatch(/kinks/i);
  });
});
