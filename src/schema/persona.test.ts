import { describe, expect, it } from "vitest";
import { createBlankCard } from "./normalize";
import { asPersona, createBlankPersona, isPersona, PERSONA_MARKER, personaMacroWarning } from "./persona";

describe("persona marker", () => {
  it("flags blank personas but not blank cards", () => {
    expect(isPersona(createBlankPersona())).toBe(true);
    expect(isPersona(createBlankCard())).toBe(false);
  });

  it("asPersona keeps existing extensions and is idempotent", () => {
    const card = { ...createBlankCard(), extensions: { talkativeness: "0.5" } };
    const persona = asPersona(card);
    expect(persona.extensions).toEqual({ talkativeness: "0.5", [PERSONA_MARKER]: true });
    expect(asPersona(persona)).toBe(persona);
  });
});

describe("personaMacroWarning", () => {
  it("warns about {{char}} / {{user}} in any case", () => {
    expect(personaMacroWarning("{{User}} is tall.")).toBeDefined();
    expect(personaMacroWarning("Talks to {{char}} a lot.")).toBeDefined();
    expect(personaMacroWarning("Mara is tall.")).toBeUndefined();
  });
});
