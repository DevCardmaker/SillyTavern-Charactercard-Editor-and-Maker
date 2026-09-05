import { describe, expect, it } from "vitest";
import { aiRelocateToJsonSchema, parseAiRelocate } from "./aiRelocate";

const member = (name: string) => ({
  name,
  description: "A description.",
  personality: "Friendly.",
  scenario: "A new home.",
  first_mes: "Hello!",
  mes_example: "Example line.",
});

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

  it("rejects a member missing a required field", () => {
    const { mes_example: _mes_example, ...incomplete } = member("Father");
    const result = parseAiRelocate(1, { characters: [incomplete] });
    expect(result.success).toBe(false);
  });
});
