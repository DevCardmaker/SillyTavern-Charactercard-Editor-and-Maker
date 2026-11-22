import { describe, expect, it } from "vitest";
import {
  applyInline,
  buildInlineMessages,
  cleanInlineResult,
  inlineProblem,
  inlineTarget,
  keepSurroundingSpace,
  restoreCharMacro,
} from "./inlineAi";

const GERMAN =
  "Anna ist eine ruhige Bibliothekarin, die in einer kleinen Stadt am Meer lebt. Sie liest gern alte Bücher und trinkt jeden Morgen Tee mit ihrer Nachbarin, die ihr von den Leuten im Ort erzählt. ";

describe("inlineTarget", () => {
  it("works on the selection, or on the whole field without one", () => {
    expect(inlineTarget("Hello there world", 6, 11)).toEqual({ start: 6, end: 11, part: "there", selected: true });
    expect(inlineTarget("Hello", 2, 2)).toEqual({ start: 0, end: 5, part: "Hello", selected: false });
    // A selection of only spaces counts as none.
    expect(inlineTarget("a   b", 1, 4).selected).toBe(false);
  });

  it("puts the result exactly in place", () => {
    const target = inlineTarget("She is very very tired.", 7, 17);
    expect(applyInline("She is very very tired.", target, keepSurroundingSpace(target.part, "utterly"))).toBe(
      "She is utterly tired.",
    );
  });
});

describe("buildInlineMessages", () => {
  it("sends the whole field as context and only asks for the selected part", () => {
    const text = `${GERMAN}Sie hat Angst vor Gewittern.`;
    const target = inlineTarget(text, GERMAN.length, text.length);
    const [system, user] = buildInlineMessages({ fieldLabel: "Description", text, target, instruction: "Make it vivid.", context: "## Name\nAnna" });
    expect(system.content).toMatch(/only the new text/);
    expect(user.content).toContain("Rewrite only this part");
    expect(user.content).toContain("Sie hat Angst vor Gewittern.");
    expect(user.content).toContain("## Name\nAnna");
    expect(user.content).toContain("Write in German");
  });

  it("repeats why the last answer was rejected", () => {
    const target = inlineTarget("Hi {{user}}", 0, 0);
    const [, user] = buildInlineMessages({ fieldLabel: "First message", text: "Hi {{user}}", target, instruction: "x", context: "", problem: "macros got lost" });
    expect(user.content).toContain("could not be used: macros got lost");
  });
});

describe("cleanInlineResult", () => {
  it("removes fences, markers, lead-ins and wrapping quotes", () => {
    expect(cleanInlineResult("```\nNew text\n```", "old")).toBe("New text");
    expect(cleanInlineResult("<<<\nNew text\n>>>", "old")).toBe("New text");
    expect(cleanInlineResult("Here is the improved text:\nNew text", "old")).toBe("New text");
    expect(cleanInlineResult("“New text”", "old")).toBe("New text");
  });

  it("keeps quotes the original had, and speech inside the text", () => {
    expect(cleanInlineResult('"Hello," she said.', '"Hi," she said.')).toBe('"Hello," she said.');
    expect(cleanInlineResult('"Go," she said, "now."', "x")).toBe('"Go," she said, "now."');
  });
});

describe("inlineProblem", () => {
  it("rejects lost macros", () => {
    expect(inlineProblem("enhance", "{{char}} smiles at {{user}}.", "She smiles at you.")).toMatch(/macros/);
  });

  it("checks that Shorten shortens and Lengthen lengthens", () => {
    expect(inlineProblem("shorten", "A short text here.", "A longer text than before here.")).toMatch(/not shorter/);
    expect(inlineProblem("lengthen", "A text that is long enough.", "A text.")).toMatch(/not longer/);
    expect(inlineProblem("shorten", "A rather long and wordy text here.", "A short text.")).toBeNull();
  });

  it("notices an unchanged answer, except for Fix", () => {
    const text = "This sentence is perfectly fine as it is.";
    expect(inlineProblem("rephrase", text, text)).toMatch(/unchanged/);
    expect(inlineProblem("fix", text, text)).toBeNull();
  });

  it("notices a switch of language", () => {
    const english =
      "Anna is a quiet librarian who lives in a small town by the sea. She likes old books and drinks tea every morning with her neighbour, who tells her about the people in the town and what they do all day. ";
    expect(inlineProblem("enhance", GERMAN, english)).toMatch(/in English instead of German/);
  });
});

describe("restoreCharMacro", () => {
  const field = "{{char}} is a librarian. {{char}}s brother is gone.";
  it("turns the name back into {{char}}, possessive included", () => {
    expect(restoreCharMacro("Lena works as a librarian. Lenas brother vanished.", field, "Lena")).toBe(
      "{{char}} works as a librarian. {{char}}s brother vanished.",
    );
  });

  it("leaves other words and fields that use the name alone", () => {
    expect(restoreCharMacro("Lenaria and Helena met.", field, "Lena")).toBe("Lenaria and Helena met.");
    expect(restoreCharMacro("Lena smiles.", "Lena is shy, {{char}} smiles.", "Lena")).toBe("Lena smiles.");
    expect(restoreCharMacro("Lena smiles.", "She is shy.", "Lena")).toBe("Lena smiles.");
  });
});
