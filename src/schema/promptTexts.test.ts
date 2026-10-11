import { afterEach, describe, expect, it } from "vitest";
import { buildCondenseSystemPrompt, buildGroupGenerateSystemPrompt, buildRelocateSystemPrompt } from "./aiPrompt";
import { DEFAULT_PROMPTS, parsePromptsFile, PROMPT_KEYS, promptText, serializeDefaultPromptsFile, setPromptOverrides } from "./promptTexts";

afterEach(() => setPromptOverrides({}));

describe("prompts file", () => {
  it("a freshly written file parses back to no overrides at all", () => {
    const parsed = parsePromptsFile(serializeDefaultPromptsFile());
    expect(parsed.overrides).toEqual({});
    expect(parsed.unknown).toEqual([]);
  });

  it("lists every section with its description", () => {
    const file = serializeDefaultPromptsFile();
    for (const key of PROMPT_KEYS) expect(file).toContain(`### ${key}\n// ${DEFAULT_PROMPTS[key].about}\n`);
  });

  it("reads edited sections, skips comments, reports unknown ones, ignores empty ones", () => {
    const parsed = parsePromptsFile(
      "// header\r\n### metric_units\r\n// about\r\nUse imperial units.\r\n\r\n### relocate\n\n### metrik_units\nx\n",
    );
    expect(parsed.overrides).toEqual({ metric_units: "Use imperial units." });
    expect(parsed.unknown).toEqual(["metrik_units"]);
  });
});

describe("promptText", () => {
  it("fills placeholders, pulls in other sections, leaves {{macros}} alone", () => {
    setPromptOverrides({ relocate: "Move {count} people. {metric_units} Keep {{user}} and {unknown}." });
    expect(promptText("relocate", { count: 2 })).toBe(
      `Move 2 people. ${DEFAULT_PROMPTS.metric_units.text} Keep {{user}} and {unknown}.`,
    );
  });

  it("an override changes every prompt that uses the section", () => {
    setPromptOverrides({ metric_units: "Use imperial units." });
    expect(buildRelocateSystemPrompt(2)).toContain("Use imperial units.");
    expect(buildGroupGenerateSystemPrompt(2)).toContain("Use imperial units.");
    expect(buildCondenseSystemPrompt("description", 100, 60)).toContain("Use imperial units. Convert any imperial");
  });

  it("(none) switches a section off without leaving an empty line", () => {
    setPromptOverrides({ metric_units: "(none)" });
    const prompt = buildRelocateSystemPrompt(2);
    expect(prompt).not.toContain("metric");
    expect(prompt).not.toContain("\n\n");
  });
});
