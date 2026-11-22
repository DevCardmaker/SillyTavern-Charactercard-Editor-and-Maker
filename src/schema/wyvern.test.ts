import { describe, expect, it } from "vitest";
import { wyvernToCard } from "./wyvern";

describe("wyvernToCard", () => {
  it("builds a V2 card from Wyvern's public fields", () => {
    const { card, avatarUrl, name } = wyvernToCard({
      id: "abc",
      name: "Bride of Sacrifice",
      description: "Desc",
      personality: "Calm",
      scenario: "A garden",
      first_mes: "Hello {{user}}",
      mes_example: "<START>",
      alternate_greetings: ["Hi again"],
      greetings: [{ content: "Third greeting" }],
      tagline: "SLICE!",
      creator_notes: "Notes",
      pre_history_instructions: "[Stay in character.]",
      post_history_instructions: "",
      tags: ["Female", 3],
      creator: { displayName: "Rose" },
      avatar: "https://imagedelivery.net/x/y/public",
    });
    expect(name).toBe("Bride of Sacrifice");
    expect(avatarUrl).toBe("https://imagedelivery.net/x/y/public");
    const data = card.data as Record<string, unknown>;
    expect(card.spec).toBe("chara_card_v2");
    expect(data.alternate_greetings).toEqual(["Hi again", "Third greeting"]);
    expect(data.creator_notes).toBe("SLICE!\n\nNotes");
    expect(data.system_prompt).toBe("[Stay in character.]");
    expect(data.tags).toEqual(["Female"]);
    expect(data.creator).toBe("Rose");
  });

  it("refuses a character without a name", () => {
    expect(() => wyvernToCard({ message: "Unauthorized" })).toThrow(/without a name/);
  });
});
