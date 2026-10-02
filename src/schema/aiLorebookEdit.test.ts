import { describe, expect, it } from "vitest";
import { parseAiLorebookEdit } from "./aiLorebookEdit";

const entry = (index: number) => ({ index, keys: ["k"], comment: "c", content: "text" });

describe("parseAiLorebookEdit", () => {
  it("accepts a reply covering exactly the sent indices, in any order", () => {
    const result = parseAiLorebookEdit([2, 5], { entries: [entry(5), entry(2)] });
    expect(result.success).toBe(true);
  });

  it("rejects a reply that renumbers entries", () => {
    const result = parseAiLorebookEdit([2, 5], { entries: [entry(0), entry(1)] });
    expect(result).toMatchObject({ success: false });
  });

  it("rejects a reply that duplicates one entry and drops another", () => {
    const result = parseAiLorebookEdit([2, 5], { entries: [entry(2), entry(2)] });
    expect(result).toMatchObject({ success: false });
  });

  it("rejects a reply with the wrong number of entries", () => {
    expect(parseAiLorebookEdit([2, 5], { entries: [entry(2)] }).success).toBe(false);
  });
});

describe("AI key cleanup", () => {
  it("drops empty and case-insensitive duplicate keys from AI replies", () => {
    const result = parseAiLorebookEdit([0], {
      entries: [{ index: 0, keys: ["Leo", " Leo Brightwood", "leo brightwood", ""], comment: "c", content: "x" }],
    });
    expect(result).toMatchObject({ success: true, data: [{ keys: ["Leo", "Leo Brightwood"] }] });
  });
});
