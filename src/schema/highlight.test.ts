import { describe, expect, it } from "vitest";
import { highlightParts } from "./highlight";

const kinds = (text: string) => highlightParts(text).map((p) => `${p.span ?? "-"}/${p.token ?? "-"}:${p.text}`);

describe("highlightParts", () => {
  it("marks dialogue, actions, macros and tags", () => {
    expect(kinds('*smiles* "Hi {{user}}!" <START>')).toEqual([
      "action/-:*smiles*",
      "-/-: ",
      'dialogue/-:"Hi ',
      "dialogue/macro:{{user}}",
      'dialogue/-:!"',
      "-/-: ",
      "-/tag:<START>",
    ]);
  });

  it("knows German, English and French quotes", () => {
    expect(highlightParts("„Hallo“ “Hello” «Salut»").filter((p) => p.span === "dialogue").map((p) => p.text)).toEqual([
      "„Hallo“",
      "“Hello”",
      "«Salut»",
    ]);
  });

  it("lets an opening quote end with any closing one, as mixed quotes are common", () => {
    const text =
      'müde. „Hey, willkommen im Mystery Shack", sagte sie und klappte das Magazin zu. „Wenn du was suchst, bist du hier genau richtig." Sie richtete sich auf.';
    expect(highlightParts(text).filter((p) => p.span === "dialogue").map((p) => p.text)).toEqual([
      '„Hey, willkommen im Mystery Shack"',
      '„Wenn du was suchst, bist du hier genau richtig."',
    ]);
    expect(highlightParts("»Komm«, sagte er. \"Gleich” — “Ja\"").filter((p) => p.span === "dialogue").map((p) => p.text)).toEqual([
      "»Komm«",
      '"Gleich”',
      '“Ja"',
    ]);
  });

  it("leaves an unclosed quote or asterisk plain, and doesn't run across lines", () => {
    expect(highlightParts('She says "Hello and keeps').every((p) => p.span === null)).toBe(true);
    expect(highlightParts("*waves\nand then*").every((p) => p.span === null)).toBe(true);
  });

  it("gives back the whole text, piece by piece", () => {
    const text = '{{char}} *nods*. "Yes," she says.\n\n<START>\n{{user}}: "Hi"';
    expect(highlightParts(text).map((p) => p.text).join("")).toBe(text);
  });
});
