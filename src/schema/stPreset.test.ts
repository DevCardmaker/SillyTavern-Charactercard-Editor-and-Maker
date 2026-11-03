import { describe, expect, it } from "vitest";
import {
  addPrompt,
  canDeletePrompt,
  canEditPrompt,
  canTogglePrompt,
  countRegexScripts,
  deletePrompt,
  enabledPromptTexts,
  isSilentlyIgnored,
  listPromptRows,
  listUnplacedPrompts,
  movePrompt,
  parseStPreset,
  placePrompt,
  promptWarning,
  removeRow,
  serializeStPreset,
  setPromptEnabled,
  updatePrompt,
  usesFallbackOrder,
  type StPreset,
} from "./stPreset";

/** Unknown fields at every level, as real presets and newer SillyTavern versions have them. */
const sample = (): StPreset =>
  parseStPreset(
    JSON.stringify({
      temperature: 1.15,
      future_setting: { nested: [1, 2, 3] },
      extensions: { regex_scripts: [{ id: "a" }, { id: "b" }], other_extension: true },
      prompts: [
        { identifier: "main", name: "Main", role: "system", content: "Main text", system_prompt: true, marker: false, extra: "x" },
        { identifier: "chatHistory", name: "Chat History", system_prompt: true, marker: true },
        { identifier: "dialogueExamples", name: "Examples", system_prompt: true, marker: true },
        { identifier: "custom-a", name: "A", role: "system", content: "Text A", system_prompt: false, marker: false, injection_trigger: ["normal"] },
        { identifier: "custom-b", name: "B", role: "user", content: "Text B", system_prompt: false, marker: false },
        { identifier: "unplaced", name: "Unplaced", content: "Text", system_prompt: false, marker: false },
      ],
      prompt_order: [
        { character_id: 100000, order: [{ identifier: "main", enabled: true }, { identifier: "custom-a", enabled: true }] },
        {
          character_id: 100001,
          future_field: "keep",
          order: [
            { identifier: "main", enabled: true, note: "keep me" },
            { identifier: "custom-a", enabled: true },
            { identifier: "chatHistory", enabled: true },
            { identifier: "custom-b", enabled: false },
          ],
        },
      ],
    }),
  );

const order = (preset: StPreset) => listPromptRows(preset).map((row) => row.identifier);

describe("parseStPreset", () => {
  it("rejects files that aren't Chat Completion presets", () => {
    expect(() => parseStPreset("not json")).toThrow(/not valid JSON/);
    expect(() => parseStPreset('{"temp": 1, "top_p": 0.9}')).toThrow(/not a Chat Completion preset/);
    expect(() => parseStPreset('{"prompts": [], "prompt_order": [{"order": "x"}]}')).toThrow(/not a Chat Completion/);
    expect(() => parseStPreset('{"prompts": ["x"], "prompt_order": []}')).toThrow(/not a Chat Completion/);
  });

  it("reads a file with a byte order mark", () => {
    expect(parseStPreset('﻿{"prompts": [], "prompt_order": []}').prompts).toEqual([]);
  });
});

describe("keeping everything else", () => {
  it("writes an unedited file back unchanged, in SillyTavern's formatting", () => {
    const text = JSON.stringify(JSON.parse(serializeStPreset(sample())), null, 4);
    expect(serializeStPreset(parseStPreset(text))).toBe(text);
  });

  it("an edit changes nothing but its own field", () => {
    const before = sample();
    const edited = updatePrompt(before, "custom-a", { content: "New" });
    const expected = JSON.parse(serializeStPreset(before));
    expected.prompts[3].content = "New";
    expect(JSON.parse(serializeStPreset(edited))).toEqual(expected);
  });

  it("does not change the object it was given", () => {
    const before = sample();
    const snapshot = serializeStPreset(before);
    updatePrompt(before, "custom-a", { content: "New" });
    setPromptEnabled(before, 0, false);
    movePrompt(before, 0, 2);
    deletePrompt(before, "custom-a");
    addPrompt(before, 0, "new");
    expect(serializeStPreset(before)).toBe(snapshot);
  });

  it("toggling and moving keep a row's unknown fields and the other order set", () => {
    const moved = setPromptEnabled(movePrompt(sample(), 0, 3), 3, false);
    expect(moved.prompt_order[1].order[3]).toEqual({ identifier: "main", enabled: false, note: "keep me" });
    expect(moved.prompt_order[1].future_field).toBe("keep");
    expect(moved.prompt_order[0]).toEqual(sample().prompt_order[0]);
  });
});

describe("the prompt list", () => {
  it("uses SillyTavern's order set, whatever its position in the file", () => {
    expect(order(sample())).toEqual(["main", "custom-a", "chatHistory", "custom-b"]);
    expect(usesFallbackOrder(sample())).toBe(false);
  });

  it("falls back to the first order set and says so", () => {
    const preset = parseStPreset('{"prompts": [], "prompt_order": [{"character_id": 5, "order": [{"identifier": "x", "enabled": true}]}]}');
    expect(order(preset)).toEqual(["x"]);
    expect(usesFallbackOrder(preset)).toBe(true);
  });

  it("creates SillyTavern's order set when a file has none", () => {
    const preset = placePrompt(parseStPreset('{"prompts": [{"identifier": "x"}], "prompt_order": []}'), "x", -1);
    expect(preset.prompt_order).toEqual([{ character_id: 100001, order: [{ identifier: "x", enabled: true }] }]);
    expect(usesFallbackOrder(preset)).toBe(false);
  });

  it("lists prompts missing from the order, and places them", () => {
    const preset = sample();
    expect(listUnplacedPrompts(preset).map((p) => p.identifier)).toEqual(["dialogueExamples", "unplaced"]);
    const placed = placePrompt(preset, "unplaced", 0);
    expect(order(placed)).toEqual(["main", "unplaced", "custom-a", "chatHistory", "custom-b"]);
    expect(listPromptRows(placed)[1].enabled).toBe(true);
  });

  it("moves rows, and clamps targets outside the list", () => {
    expect(order(movePrompt(sample(), 3, 0))).toEqual(["custom-b", "main", "custom-a", "chatHistory"]);
    expect(order(movePrompt(sample(), 0, 99))).toEqual(["custom-a", "chatHistory", "custom-b", "main"]);
    expect(order(movePrompt(sample(), 2, -5))).toEqual(["chatHistory", "main", "custom-a", "custom-b"]);
  });

  it("adds a new prompt that SillyTavern will really send", () => {
    const preset = addPrompt(sample(), 0, "fresh");
    const row = listPromptRows(preset)[1];
    expect(row).toMatchObject({ identifier: "fresh", enabled: true });
    expect(row.prompt?.system_prompt).toBe(false);
    expect(row.prompt && isSilentlyIgnored(row.prompt)).toBe(false);
  });

  it("deletes a user prompt from the file and all order sets, but never a built-in one", () => {
    const preset = deletePrompt(sample(), "custom-a");
    expect(preset.prompts.some((p) => p.identifier === "custom-a")).toBe(false);
    expect(preset.prompt_order.flatMap((s) => s.order).some((e) => e.identifier === "custom-a")).toBe(false);
    expect(deletePrompt(sample(), "main").prompts).toHaveLength(6);
  });

  it("removes a row without touching other rows", () => {
    expect(order(removeRow(sample(), 1))).toEqual(["main", "chatHistory", "custom-b"]);
  });
});

describe("what SillyTavern allows", () => {
  const [main, history] = sample().prompts;
  it("markers aren't editable; only some can be switched off", () => {
    expect(canEditPrompt(history)).toBe(false);
    expect(canEditPrompt(main)).toBe(true);
    expect(canTogglePrompt(history)).toBe(true);
    expect(canTogglePrompt({ identifier: "other", marker: true })).toBe(false);
    expect(canTogglePrompt(undefined)).toBe(false);
  });

  it("only user prompts can be deleted", () => {
    expect(canDeletePrompt(main)).toBe(false);
    expect(canDeletePrompt({ identifier: "x", system_prompt: false })).toBe(true);
  });
});

describe("warnings", () => {
  const row = (prompt: Record<string, unknown> | undefined, enabled = true) => ({ position: 0, identifier: "x", enabled, prompt });

  it("finds own prompts marked as system prompts, which SillyTavern never sends", () => {
    expect(promptWarning(row({ identifier: "mine", system_prompt: true, content: "x" }))).toMatch(/never sends/);
    expect(promptWarning(row({ identifier: "main", system_prompt: true, content: "x" }))).toBeUndefined();
    expect(promptWarning(row({ identifier: "mine", system_prompt: true, content: "x", injection_position: 1 }))).toBeUndefined();
    expect(promptWarning(row({ identifier: "mine", system_prompt: true, marker: true }))).toBeUndefined();
  });

  it("finds empty prompts that are on and references to missing prompts", () => {
    expect(promptWarning(row({ identifier: "a", system_prompt: false, content: " " }))).toMatch(/empty/);
    expect(promptWarning(row({ identifier: "a", system_prompt: false, content: "" }, false))).toBeUndefined();
    expect(promptWarning(row(undefined))).toMatch(/doesn't contain/);
  });
});

describe("summary values", () => {
  it("counts regex scripts, also when there are none", () => {
    expect(countRegexScripts(sample())).toBe(2);
    expect(countRegexScripts(parseStPreset('{"prompts": [], "prompt_order": []}'))).toBe(0);
  });

  it("collects only the text the preset itself sends", () => {
    const preset = updatePrompt(sample(), "custom-a", { system_prompt: true });
    expect(enabledPromptTexts(preset)).toEqual(["Main text"]);
  });
});
