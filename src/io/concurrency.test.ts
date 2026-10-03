import { describe, expect, it } from "vitest";
import { concurrencyFor, mapConcurrent } from "./concurrency";

describe("mapConcurrent", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapConcurrent([30, 5, 20, 1, 10], 2, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i * 10;
    });
    expect(result).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it("runs one at a time with limit 1 and handles empty input", async () => {
    const order: number[] = [];
    await mapConcurrent([3, 1, 2], 1, async (n) => void order.push(n));
    expect(order).toEqual([3, 1, 2]);
    expect(await mapConcurrent([], 4, async () => 1)).toEqual([]);
  });

  it("rejects with the first error", async () => {
    await expect(mapConcurrent([1, 2], 2, async (n) => { if (n === 2) throw new Error("boom"); return n; })).rejects.toThrow("boom");
  });
});

describe("concurrencyFor", () => {
  it("is 1 unless the profile opts in", () => {
    const base = { baseUrl: "x", apiKey: "", model: "m" };
    expect(concurrencyFor(base)).toBe(1);
    expect(concurrencyFor({ ...base, parallel: true })).toBe(4);
  });
});
