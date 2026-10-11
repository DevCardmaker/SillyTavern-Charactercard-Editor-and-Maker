import { describe, expect, it } from "vitest";
import {
  buildPersonaFitContext,
  buildPersonaSystemPrompt,
  buildUserTurn,
  PERSONA_AI_FIELD_KEYS,
  buildGroupGenerateSystemPrompt,
  buildGroupGenerateUserTurn,
  buildIntegrateMembersSystemPrompt,
  buildIntegrateMembersUserTurn,
  findDuplicateReferenceNames,
  buildLorebookEditSystemPrompt,
  buildLorebookEditUserTurn,
  buildLorebookSystemPrompt,
  buildLorebookUserTurn,
  buildRelocateSystemPrompt,
  buildRelocateUserTurn,
  buildSystemPrompt,
  DEFAULT_LOREBOOK_EDIT_INSTRUCTION,
  summarizeLorebookForAi,
} from "./aiPrompt";
import { createBlankCard } from "./normalize";

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
  it("states the member count and lists all five adaptable fields", () => {
    const prompt = buildRelocateSystemPrompt(3);
    expect(prompt).toMatch(/exactly 3 entries/);
    expect(prompt).toMatch(/name: exactly as given/i);
    expect(prompt).toMatch(/description, personality, scenario, first_mes, mes_example/);
  });

  it("tells the model to preserve core identity/backstory and only adapt location-tied details", () => {
    const prompt = buildRelocateSystemPrompt(2);
    expect(prompt).toMatch(/core identity/i);
    expect(prompt).toMatch(/formative experiences/i);
  });

  it("does not reuse the from-scratch generation checklists — this is an adaptation, not invention", () => {
    const prompt = buildRelocateSystemPrompt(2);
    expect(prompt).not.toMatch(/physical appearance/i);
  });
});

describe("buildRelocateUserTurn", () => {
  it("includes the character summaries (with mes_example) and the new setting", () => {
    const summary = {
      name: "Mom",
      description: "d",
      personality: "p",
      scenario: "old home",
      first_mes: "hi",
      mes_example: "old dialogue line",
    };
    const turn = buildRelocateUserTurn([summary], "moves to Tokyo");
    expect(turn.content).toContain("old home");
    expect(turn.content).toContain("old dialogue line");
    expect(turn.content).toContain("moves to Tokyo");
  });
});

describe("lorebook prompts", () => {
  const book = {
    name: "World",
    description: "Fantasy",
    extensions: {},
    entries: Array.from({ length: 5 }, (_, i) => ({
      keys: [`k${i}`],
      content: `long content ${i}`,
      comment: `Entry ${i}`,
      extensions: {},
      enabled: true,
      insertion_order: 0,
    })),
  };

  it("summarizes a lorebook as labels + keys only, honoring exclusions and the cap", () => {
    const overview = summarizeLorebookForAi(book, new Set([1]), 2);
    expect(overview.entries).toEqual([
      { index: 0, comment: "Entry 0", keys: ["k0"] },
      { index: 2, comment: "Entry 2", keys: ["k2"] },
    ]);
    expect(overview.omittedEntries).toBe(2);
    expect(JSON.stringify(overview)).not.toContain("long content");
  });

  it("includes the existing lorebook in the suggest-entries turn when given", () => {
    const turn = buildLorebookUserTurn("a family", [], summarizeLorebookForAi(book));
    expect(turn.content).toContain("Existing lorebook");
    expect(turn.content).toContain("Entry 4");
    expect(buildLorebookUserTurn("a family", []).content).not.toContain("Existing lorebook");
  });

  it("asks for brief foundational entries in both lorebook system prompts", () => {
    expect(buildLorebookSystemPrompt()).toContain("foundational entries");
    expect(buildLorebookEditSystemPrompt(3)).toContain("foundational entries");
    expect(buildLorebookEditSystemPrompt(3)).toContain("exactly 3 entries");
  });

  it("falls back to filling empty entries when the edit instruction is blank", () => {
    const turn = buildLorebookEditUserTurn(summarizeLorebookForAi(book), [], "  ");
    expect(turn.content).toContain(DEFAULT_LOREBOOK_EDIT_INSTRUCTION);
  });
});

describe("buildPersonaSystemPrompt", () => {
  it("frames the persona as the user's character and only lists the selected fields", () => {
    const prompt = buildPersonaSystemPrompt(["description"]);
    expect(prompt).toContain("the character the user plays");
    expect(prompt).toContain("- description:");
    expect(prompt).not.toContain("- name:");
    expect(prompt).toContain("never use {{user}} or {{char}}");
  });

  it("uses persona guidance instead of the character-card checklist", () => {
    const prompt = buildPersonaSystemPrompt(PERSONA_AI_FIELD_KEYS);
    expect(prompt).toContain("- name: The persona's name");
    expect(prompt).not.toContain("formative experience");
  });
});

describe("persona fit context", () => {
  it("puts the character summary ahead of the draft", () => {
    const card = { ...createBlankCard(), name: "Mara", scenario: "A harbor town" };
    const turn = buildUserTurn("a sailor", { name: "" }, buildPersonaFitContext([card]));
    expect(turn.content.indexOf("A harbor town")).toBeLessThan(turn.content.indexOf("Current draft"));
    expect(turn.content).toContain("don't describe the character");
    expect(turn.content).toContain("opposite this character");
    expect(buildUserTurn("x", {}).content.startsWith("Current draft")).toBe(true);
  });

  it("asks for one role that fits the whole group when several characters are picked", () => {
    const mara = { ...createBlankCard(), name: "Mara", scenario: "A harbor town" };
    const jonas = { ...createBlankCard(), name: "Jonas", scenario: "The lighthouse" };
    const context = buildPersonaFitContext([mara, jonas]);
    expect(context).toContain("all of these characters together");
    expect(context).toContain("each of them");
    expect(context).toContain("A harbor town");
    expect(context).toContain("The lighthouse");
    expect(context).not.toContain("opposite this character");
  });
});

describe("metric units", () => {
  it("asks for metric units in every prompt that writes card text", () => {
    for (const prompt of [
      buildSystemPrompt(["description"]),
      buildPersonaSystemPrompt(PERSONA_AI_FIELD_KEYS),
      buildLorebookSystemPrompt(),
      buildLorebookEditSystemPrompt(2),
      buildGroupGenerateSystemPrompt(3),
      buildRelocateSystemPrompt(2),
    ]) {
      expect(prompt).toContain("Use metric units");
    }
  });
});

describe("group generate with reference cards", () => {
  const sister = { name: "Lena", description: "Lena, 19. Her brother Tom is a firefighter.", personality: "", scenario: "", first_mes: "" };

  it("adds the reference rules only when references are given", () => {
    expect(buildGroupGenerateSystemPrompt(3)).not.toContain("reference characters");
    const prompt = buildGroupGenerateSystemPrompt(3, { references: true });
    expect(prompt).toContain("never re-create, rewrite or include a reference character");
    expect(prompt).toContain("never contradict them");
    expect(prompt).toContain("exactly 3 entries");
  });

  it("sends the references ahead of the instruction", () => {
    const turn = buildGroupGenerateUserTurn("her brother and mother", [sister]);
    expect(turn.content).toContain("Tom is a firefighter");
    expect(turn.content.indexOf("Reference characters")).toBeLessThan(turn.content.indexOf("Instruction:"));
    expect(buildGroupGenerateUserTurn("a family").content).toBe("Instruction: a family");
  });

  it("flags new members that re-create a reference character", () => {
    const dupes = findDuplicateReferenceNames([{ name: "Tom" }, { name: " lena " }, { name: "" }], [sister, { name: "" }]);
    expect([...dupes]).toEqual([1]);
  });
});

describe("group generate with a persona", () => {
  it("adds the persona rules and sends the persona as {{user}}", () => {
    expect(buildGroupGenerateSystemPrompt(2)).not.toContain("{{user}}");
    expect(buildGroupGenerateSystemPrompt(2, { persona: true })).toContain("always write the persona as {{user}}, never by name");
    const turn = buildGroupGenerateUserTurn("her neighbours", [], { name: "Alex", description: "A new teacher in the village." });
    expect(turn.content).toContain("A new teacher in the village.");
    expect(turn.content).not.toContain("Reference characters");
    expect(turn.content.indexOf("persona")).toBeLessThan(turn.content.indexOf("Instruction:"));
  });
});

describe("integrating new members into reference cards", () => {
  it("asks for additions to the existing cards only", () => {
    const prompt = buildIntegrateMembersSystemPrompt();
    expect(prompt).toContain("never a new one");
    expect(prompt).toContain('"additions"');
    expect(prompt).toContain("Use metric units");
  });

  it("separates the cards to edit from the new ones", () => {
    const card = { name: "", description: "", personality: "", scenario: "", first_mes: "" };
    const turn = buildIntegrateMembersUserTurn([{ ...card, name: "Lena" }], [{ ...card, name: "Petra" }]);
    expect(turn.content.indexOf("Lena")).toBeLessThan(turn.content.indexOf("New characters"));
    expect(turn.content.indexOf("Petra")).toBeGreaterThan(turn.content.indexOf("New characters"));
  });
});
