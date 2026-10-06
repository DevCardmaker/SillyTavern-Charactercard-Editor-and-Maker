import { describe, expect, it } from "vitest";
import { aiConsistencyFixToJsonSchema, applySnippet, fitSentenceEnd, locateSnippet, parseAiConsistencyFix, resolveFixChanges } from "./aiConsistencyFix";
import { createBlankCard, type NormalizedCard } from "./normalize";

function slot(id: string, patch: Partial<NormalizedCard>) {
  return { id, card: { ...createBlankCard(), ...patch } };
}

describe("locateSnippet / applySnippet", () => {
  it("finds a verbatim passage", () => {
    expect(locateSnippet("She is 40 years old.", "40 years")).toEqual({ start: 7, end: 15 });
  });

  it("tolerates different whitespace (line breaks quoted as spaces)", () => {
    expect(applySnippet("Mary is\n40 years old.", "is 40 years", "is 45 years")).toBe("Mary is 45 years old.");
  });

  it("returns null for text that isn't there, and for an empty quote", () => {
    expect(locateSnippet("She is 40.", "She is 45.")).toBeNull();
    expect(locateSnippet("She is 40.", "  ")).toBeNull();
    expect(applySnippet("She is 40.", "fifty", "x")).toBeNull();
  });

  it("treats regex characters in the quote literally", () => {
    expect(applySnippet("Age (approx.) 40", "(approx.) 40", "(approx.) 45")).toBe("Age (approx.) 45");
  });
});

describe("fitSentenceEnd", () => {
  it("gives a dangling replacement the sentence ending the quoted passage had", () => {
    expect(fitSentenceEnd("grew up in Seattle and moved last year.", "grew up in Portland, ")).toBe("grew up in Portland.");
    expect(fitSentenceEnd("Is she 16?", "Is she 22")).toBe("Is she 22?");
  });

  it("leaves replacements alone that already end properly, or where the quote ended mid-sentence", () => {
    expect(fitSentenceEnd("is 16.", "is 22.")).toBe("is 22.");
    expect(fitSentenceEnd("she said \"hi.\"", "she said \"hello\"")).toBe("she said \"hello\"");
    expect(fitSentenceEnd("16 years", "22 years,")).toBe("22 years,");
  });
});

describe("resolveFixChanges", () => {
  const characters = [slot("1", { name: "Mary", description: "Mary is 40." }), slot("2", { name: "Anna", scenario: "Anna is 30." })];

  it("matches names case-insensitively and accepts quotes that exist", () => {
    const [change] = resolveFixChanges([{ character: " mary", field: "description", find: "40", replace: "55" }], characters);
    expect(change.slotId).toBe("1");
    expect(change.problem).toBeUndefined();
  });

  it("flags unknown characters and quotes that aren't in the field", () => {
    const resolved = resolveFixChanges(
      [
        { character: "Greg", field: "description", find: "x", replace: "y" },
        { character: "Anna", field: "description", find: "Anna is 30.", replace: "Anna is 20." },
      ],
      characters,
    );
    expect(resolved[0].problem).toMatch(/No open character/);
    expect(resolved[1].slotId).toBe("2");
    expect(resolved[1].problem).toMatch(/isn't in this field/);
  });

  it("drops changes that change nothing", () => {
    expect(resolveFixChanges([{ character: "Mary", field: "description", find: "40", replace: " 40 " }], characters)).toEqual([]);
  });
});

describe("schema", () => {
  it("parses a valid reply and rejects fields outside the allowed set", () => {
    const ok = parseAiConsistencyFix({ explanation: "x", changes: [{ character: "A", field: "scenario", find: "a", replace: "b" }] });
    expect(ok.success).toBe(true);
    const bad = parseAiConsistencyFix({ explanation: "x", changes: [{ character: "A", field: "name", find: "a", replace: "b" }] });
    expect(bad.success).toBe(false);
    expect(aiConsistencyFixToJsonSchema().additionalProperties).toBe(false);
  });
});
