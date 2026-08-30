import { describe, expect, it } from "vitest";
import { aiGroupToJsonSchema, parseAiGroup } from "./aiGroupGenerate";

const member = (name: string) => ({
  name,
  description: "A description.",
  personality: "Friendly.",
  scenario: "A home.",
  first_mes: "Hello!",
});

describe("aiGroupToJsonSchema", () => {
  it("forbids additional top-level properties", () => {
    const jsonSchema = aiGroupToJsonSchema(3);
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties).toHaveProperty("characters");
  });
});

describe("parseAiGroup", () => {
  it("accepts exactly `count` members", () => {
    const result = parseAiGroup(2, { characters: [member("Father"), member("Mother")] });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toHaveLength(2);
  });

  it("rejects a reply with fewer members than requested", () => {
    const result = parseAiGroup(3, { characters: [member("Father"), member("Mother")] });
    expect(result.success).toBe(false);
  });

  it("rejects a reply with more members than requested", () => {
    const result = parseAiGroup(1, { characters: [member("Father"), member("Mother")] });
    expect(result.success).toBe(false);
  });

  it("rejects a member missing a required field", () => {
    const { first_mes: _first_mes, ...incomplete } = member("Father");
    const result = parseAiGroup(1, { characters: [incomplete] });
    expect(result.success).toBe(false);
  });
});
