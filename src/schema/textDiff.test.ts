import { describe, expect, it } from "vitest";
import { wordDiff } from "./textDiff";

const rebuild = (parts: ReturnType<typeof wordDiff>, without: "added" | "removed") =>
  parts.filter((p) => p.kind !== without).map((p) => p.text).join("");

describe("wordDiff", () => {
  it("marks only the words that changed", () => {
    expect(wordDiff("She is very tall", "She is rather tall")).toEqual([
      { kind: "same", text: "She is " },
      { kind: "removed", text: "very" },
      { kind: "added", text: "rather" },
      { kind: "same", text: " tall" },
    ]);
  });

  it("handles empty sides and equal texts", () => {
    expect(wordDiff("", "new")).toEqual([{ kind: "added", text: "new" }]);
    expect(wordDiff("old", "")).toEqual([{ kind: "removed", text: "old" }]);
    expect(wordDiff("same", "same")).toEqual([{ kind: "same", text: "same" }]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("always adds up to both texts, line breaks included", () => {
    const before = "One two\n\nthree four five\nsix";
    const after = "One\n\nthree 4 five six\nseven";
    const parts = wordDiff(before, after);
    expect(rebuild(parts, "added")).toBe(before);
    expect(rebuild(parts, "removed")).toBe(after);
  });

  it("replaces the differing middle as one block when the texts are huge", () => {
    const words = (prefix: string) => Array.from({ length: 3000 }, (_, i) => `${prefix}${i}`).join(" ");
    const parts = wordDiff(`start ${words("a")} end`, `start ${words("b")} end`);
    expect(parts.map((p) => p.kind)).toEqual(["same", "removed", "added", "same"]);
  });
});
