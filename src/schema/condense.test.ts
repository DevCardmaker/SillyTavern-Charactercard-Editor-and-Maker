import { describe, expect, it } from "vitest";
import { looksCutOff, splitForCondense } from "./condense";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const long = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ") + ".";

describe("splitForCondense", () => {
  it("splits on line breaks, keeps them, and skips short sections", () => {
    const text = `${long(80)}\n\nShort line.\n${long(70)}`;
    const pieces = splitForCondense(text, "description", words);
    expect(pieces.map((p) => p.condense)).toEqual([true, false, false, false, true]);
    expect(pieces.map((p) => p.text).join("")).toBe(text);
  });

  it("keeps example dialogue and first message whole", () => {
    const text = `<START>\n${long(40)}\n${long(40)}`;
    expect(splitForCondense(text, "mes_example", words)).toEqual([{ text, condense: true }]);
  });
});

describe("looksCutOff", () => {
  it("flags a reply that stops mid-sentence, like after an unescaped 5'11\"", () => {
    expect(looksCutOff("She is 5'11\" tall and loud.", "She is 5'11")).toBe(true);
  });

  it("accepts replies ending like a sentence or like the original", () => {
    expect(looksCutOff("A long original sentence here.", "Shorter here.")).toBe(false);
    expect(looksCutOff("Kinks:(submission, anal,)", "Kinks:(submission, anal)")).toBe(false);
    expect(looksCutOff("tags, more tags, end", "tags, end")).toBe(false);
  });

  it("flags empty or drastically shortened replies", () => {
    expect(looksCutOff("x", "  ")).toBe(true);
    expect(looksCutOff(long(100), "w0 w1.")).toBe(true);
  });
});
