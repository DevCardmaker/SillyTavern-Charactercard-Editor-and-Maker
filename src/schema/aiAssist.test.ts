import { describe, expect, it } from "vitest";
import { aiFieldsSchema, aiFieldsToJsonSchema, parseAiPatch } from "./aiAssist";

describe("aiFieldsSchema", () => {
  it("only exposes the selected fields", () => {
    const schema = aiFieldsSchema(["description", "tags"]);
    const result = schema.safeParse({ description: "A wanderer.", tags: ["mystical"] });
    expect(result.success).toBe(true);
    expect(result.success && Object.keys(result.data)).toEqual(["description", "tags"]);
  });

  it("requires name when name is selected and rejects a missing one", () => {
    const schema = aiFieldsSchema(["name"]);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ name: "Elira" }).success).toBe(true);
  });
});

describe("aiFieldsToJsonSchema", () => {
  it("forbids additional properties beyond the selected fields", () => {
    const jsonSchema = aiFieldsToJsonSchema(["description"]);
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties).toHaveProperty("description");
    expect(jsonSchema.properties).not.toHaveProperty("name");
  });
});

describe("parseAiPatch", () => {
  it("accepts a valid patch for the selected fields", () => {
    const result = parseAiPatch(["personality", "scenario"], {
      personality: "Curious and brave.",
      scenario: "An abandoned library.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a patch with the wrong field types", () => {
    const result = parseAiPatch(["tags"], { tags: "should be an array" });
    expect(result.success).toBe(false);
  });
});
