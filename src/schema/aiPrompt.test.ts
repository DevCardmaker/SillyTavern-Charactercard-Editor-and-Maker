import { describe, expect, it } from "vitest";
import { buildGroupGenerateSystemPrompt, buildRelocateSystemPrompt, buildRelocateUserTurn, buildSystemPrompt } from "./aiPrompt";

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

describe("buildGroupGenerateSystemPrompt", () => {
  it("carries the same description/personality checklists as buildSystemPrompt", () => {
    const prompt = buildGroupGenerateSystemPrompt(4);
    expect(prompt).toMatch(/physical appearance/i);
    expect(prompt).toMatch(/formative experience/i);
    expect(prompt).toMatch(/causal link/i);
    expect(prompt).toMatch(/kinks/i);
  });

  it("states the requested member count", () => {
    const prompt = buildGroupGenerateSystemPrompt(4);
    expect(prompt).toMatch(/4 new, related/);
    expect(prompt).toMatch(/exactly 4 entries/);
  });
});

describe("buildRelocateSystemPrompt", () => {
  it("states the member count and asks only for name/scenario", () => {
    const prompt = buildRelocateSystemPrompt(3);
    expect(prompt).toMatch(/exactly 3 entries/);
    expect(prompt).toMatch(/name: exactly as given/i);
    expect(prompt).toMatch(/scenario: the updated setting/i);
  });

  it("tells the model to keep identity and personality unchanged", () => {
    const prompt = buildRelocateSystemPrompt(2);
    expect(prompt).toMatch(/identity, personality, and relationships/i);
  });
});

describe("buildRelocateUserTurn", () => {
  it("includes the character summaries and the new setting", () => {
    const summary = { name: "Mom", description: "d", personality: "p", scenario: "old home", first_mes: "hi" };
    const turn = buildRelocateUserTurn([summary], "moves to Tokyo");
    expect(turn.content).toContain("old home");
    expect(turn.content).toContain("moves to Tokyo");
  });
});
