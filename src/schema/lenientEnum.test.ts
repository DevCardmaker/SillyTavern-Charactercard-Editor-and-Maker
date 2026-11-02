import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiConsistencyFixToJsonSchema } from "./aiConsistencyFix";
import { aiIntegrateToJsonSchema } from "./aiIntegrateMembers";
import { aiSplitPeopleToJsonSchema } from "./aiSplitGroup";
import { aiImageIdeasToJsonSchema } from "./imageToCards";
import { guessCardField, lenientEnum } from "./lenientEnum";
import { aiStoryLoreToJsonSchema } from "./storyLore";

describe("lenientEnum", () => {
  const fields = ["description", "personality", "scenario", "first_mes"] as const;
  const field = lenientEnum(fields, guessCardField(fields));

  it("keeps allowed values and reads case and spacing variants of them", () => {
    expect(field.parse("scenario")).toBe("scenario");
    expect(field.parse(" First-Mes ")).toBe("first_mes");
  });

  it("maps a model's own words to an allowed value, else the first", () => {
    expect(field.parse("First message")).toBe("first_mes");
    expect(field.parse("Personality traits")).toBe("personality");
    expect(field.parse("backstory")).toBe("description");
    expect(field.parse(undefined)).toBe("description");
  });

  it("never guesses a field that isn't allowed", () => {
    const noOpening = ["description", "personality", "scenario"] as const;
    expect(lenientEnum(noOpening, guessCardField(noOpening)).parse("greeting")).toBe("description");
  });

  it("still sends only the allowed values in the JSON schema", () => {
    const schema = z.toJSONSchema(z.object({ field })) as unknown as { properties: { field: { enum: string[] } } };
    expect(schema.properties.field.enum).toEqual([...fields]);
  });
});

describe("schemas with lenient enums", () => {
  it("still turn into JSON schemas that list the allowed values", () => {
    const schemas = [
      aiImageIdeasToJsonSchema(),
      aiStoryLoreToJsonSchema(),
      aiSplitPeopleToJsonSchema(),
      aiIntegrateToJsonSchema(),
      aiConsistencyFixToJsonSchema(),
    ].map((schema) => JSON.stringify(schema));
    for (const values of ['["character","narrator"]', '["place","group","term"]', '["card","lorebook"]', '"enum":["description"']) {
      expect(schemas.some((json) => json.includes(values))).toBe(true);
    }
  });
});
