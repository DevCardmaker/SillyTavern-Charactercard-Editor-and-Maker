import { describe, expect, it } from "vitest";
import { findOverusedName, overusedNameWarning } from "./overusedNames";

describe("overused names", () => {
  it("finds a first name or a surname, in any spelling", () => {
    expect(findOverusedName("Elara")).toBe("Elara");
    expect(findOverusedName("ELARA")).toBe("ELARA");
    expect(findOverusedName("Anna Thorne")).toBe("Thorne");
    expect(findOverusedName("Dr. Kael-Voss")).toBe("Kael");
  });

  it("only matches whole name parts", () => {
    expect(findOverusedName("Elaranne")).toBeUndefined();
    expect(findOverusedName("Marlyra")).toBeUndefined();
    expect(findOverusedName("Sarah Miller")).toBeUndefined();
    expect(findOverusedName("")).toBeUndefined();
    expect(findOverusedName("Jürgen Müller")).toBeUndefined();
  });

  it("names the match in the warning, and stays quiet otherwise", () => {
    expect(overusedNameWarning("Elara Voss")).toContain("“Elara”");
    expect(overusedNameWarning("Sarah")).toBeUndefined();
  });
});
