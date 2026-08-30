import { describe, expect, it } from "vitest";
import {
  combineWarnings,
  emptyFirstMesWarning,
  emptyNameWarning,
  lorebookEntryMissingKeysWarning,
  unbalancedMacroWarning,
} from "./warnings";
import type { LorebookEntry } from "./lorebook";

function entry(overrides: Partial<LorebookEntry> = {}): LorebookEntry {
  return { keys: [], content: "", extensions: {}, enabled: true, insertion_order: 0, ...overrides };
}

describe("unbalancedMacroWarning", () => {
  it("is undefined for balanced or macro-free text", () => {
    expect(unbalancedMacroWarning("Hello {{char}}, I am {{user}}.")).toBeUndefined();
    expect(unbalancedMacroWarning("Ganz normaler Text ohne Makros.")).toBeUndefined();
  });

  it("flags a stray opening or closing brace pair", () => {
    expect(unbalancedMacroWarning("Hello {{char}, how are you?")).toBeDefined();
    expect(unbalancedMacroWarning("Hello char}}, how are you?")).toBeDefined();
  });
});

describe("emptyNameWarning / emptyFirstMesWarning", () => {
  it("flags empty or whitespace-only values", () => {
    expect(emptyNameWarning("")).toBeDefined();
    expect(emptyNameWarning("   ")).toBeDefined();
    expect(emptyNameWarning("Aragorn")).toBeUndefined();

    expect(emptyFirstMesWarning("")).toBeDefined();
    expect(emptyFirstMesWarning("Hello!")).toBeUndefined();
  });
});

describe("lorebookEntryMissingKeysWarning", () => {
  it("flags entries with no non-empty keys", () => {
    expect(lorebookEntryMissingKeysWarning(entry())).toBeDefined();
    expect(lorebookEntryMissingKeysWarning(entry({ keys: ["", "  "] }))).toBeDefined();
  });

  it("does not flag entries with at least one real key", () => {
    expect(lorebookEntryMissingKeysWarning(entry({ keys: ["Drache"] }))).toBeUndefined();
  });

  it("does not flag constant entries even without keys", () => {
    expect(lorebookEntryMissingKeysWarning(entry({ constant: true }))).toBeUndefined();
  });
});

describe("combineWarnings", () => {
  it("joins active warnings and drops undefined ones", () => {
    expect(combineWarnings(undefined, "A", undefined, "B")).toBe("A · B");
  });

  it("returns undefined when nothing applies", () => {
    expect(combineWarnings(undefined, undefined)).toBeUndefined();
  });
});
