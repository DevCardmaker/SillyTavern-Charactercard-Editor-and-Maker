import { describe, expect, it } from "vitest";
import { aiConsistencyCheckToJsonSchema, parseAiConsistencyCheck } from "./aiConsistencyCheck";

describe("aiConsistencyCheckToJsonSchema", () => {
  it("forbids additional top-level properties", () => {
    const jsonSchema = aiConsistencyCheckToJsonSchema();
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties).toHaveProperty("findings");
  });
});

describe("parseAiConsistencyCheck", () => {
  it("accepts a list of findings, each with characters and an issue", () => {
    const result = parseAiConsistencyCheck({
      findings: [{ characters: ["Father", "Child"], issue: "The child is described as older than the father." }],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toHaveLength(1);
  });

  it("accepts an empty findings list as a valid result", () => {
    const result = parseAiConsistencyCheck({ findings: [] });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual([]);
  });

  it("rejects a finding missing the issue field", () => {
    const result = parseAiConsistencyCheck({ findings: [{ characters: ["Father"] }] });
    expect(result.success).toBe(false);
  });
});
