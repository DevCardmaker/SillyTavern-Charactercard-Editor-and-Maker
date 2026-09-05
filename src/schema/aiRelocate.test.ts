import { describe, expect, it } from "vitest";
import { aiRelocateToJsonSchema, parseAiRelocate } from "./aiRelocate";

const member = (name: string) => ({ name, scenario: "A new home." });

describe("aiRelocateToJsonSchema", () => {
  it("forbids additional top-level properties", () => {
    const jsonSchema = aiRelocateToJsonSchema(2);
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties).toHaveProperty("characters");
  });
});

describe("parseAiRelocate", () => {
  it("accepts exactly `count` members", () => {
    const result = parseAiRelocate(2, { characters: [member("Father"), member("Mother")] });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toHaveLength(2);
  });

  it("rejects a reply with a different member count than requested", () => {
    const result = parseAiRelocate(3, { characters: [member("Father"), member("Mother")] });
    expect(result.success).toBe(false);
  });

  it("rejects a member missing scenario", () => {
    const result = parseAiRelocate(1, { characters: [{ name: "Father" }] });
    expect(result.success).toBe(false);
  });
});
