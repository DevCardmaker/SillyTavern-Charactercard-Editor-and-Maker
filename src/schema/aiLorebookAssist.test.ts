import { describe, expect, it } from "vitest";
import { aiLorebookEntriesToJsonSchema, parseAiLorebookEntries } from "./aiLorebookAssist";

describe("aiLorebookEntriesToJsonSchema", () => {
  it("produces an object schema forbidding additional top-level properties", () => {
    const schema = aiLorebookEntriesToJsonSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("entries");
  });
});

describe("parseAiLorebookEntries", () => {
  it("accepts a valid list of entries", () => {
    const result = parseAiLorebookEntries({
      entries: [{ keys: ["Elara"], content: "The character's mother.", comment: "Mother Elara" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an entry without the optional comment", () => {
    const result = parseAiLorebookEntries({ entries: [{ keys: ["Jonas"], content: "Bester Freund." }] });
    expect(result.success).toBe(true);
  });

  it("rejects an entry missing required fields", () => {
    const result = parseAiLorebookEntries({ entries: [{ keys: ["Jonas"] }] });
    expect(result.success).toBe(false);
  });

  it("rejects a top-level shape that isn't { entries: [...] }", () => {
    const result = parseAiLorebookEntries([{ keys: ["Jonas"], content: "x" }]);
    expect(result.success).toBe(false);
  });
});
