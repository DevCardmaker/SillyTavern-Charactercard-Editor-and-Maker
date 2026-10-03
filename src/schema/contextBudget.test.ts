import { describe, expect, it } from "vitest";
import { contextBudget, DEFAULT_BUDGET_SETTINGS } from "./contextBudget";
import { createBlankCard, type NormalizedCard } from "./normalize";

/** One token per word keeps the arithmetic readable. */
const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

function card(patch: Partial<NormalizedCard>): NormalizedCard {
  return { ...createBlankCard(), ...patch };
}

describe("contextBudget", () => {
  it("splits permanent from early-chat parts and computes the chat space", () => {
    const budget = contextBudget(
      card({
        description: "one two three",
        scenario: "four",
        mes_example: "a b",
        first_mes: "c",
        extensions: { depth_prompt: { prompt: "stay in character", depth: 4, role: "system" } },
      }),
      words,
      DEFAULT_BUDGET_SETTINGS,
      "persona text",
    );
    expect(budget.permanent.map((l) => [l.label, l.tokens])).toEqual([
      ["Description", 3],
      ["Scenario", 1],
      ["Character's note", 3],
      ["Persona", 2],
    ]);
    expect(budget.permanentTotal).toBe(9);
    expect(budget.earlyTotal).toBe(3);
    expect(budget.chatSpace).toBe(16384 - 400 - 9);
  });

  it("counts enabled constant lorebook entries as permanent and sizes triggered ones against the WI cap", () => {
    const entry = (content: string, extra = {}) => ({ keys: ["k"], content, extensions: {}, enabled: true, insertion_order: 0, ...extra });
    const budget = contextBudget(
      card({
        character_book: {
          extensions: {},
          entries: [
            entry("always on here", { constant: true }),
            entry("off", { constant: true, enabled: false }),
            entry("a b c d e"),
            entry("a b"),
          ],
        },
      }),
      words,
    );
    expect(budget.constantLoreTokens).toBe(3);
    expect(budget.permanent[budget.permanent.length - 1]).toEqual({ label: "Always-active lorebook entries", tokens: 3 });
    expect(budget.worldInfoCap).toBe(4096);
    expect(budget.triggeredLoreEntries).toBe(2);
    expect(budget.largestTriggeredLore).toBe(5);
  });
});
