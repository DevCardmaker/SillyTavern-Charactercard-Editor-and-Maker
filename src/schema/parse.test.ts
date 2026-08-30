import { describe, expect, it } from "vitest";
import type { CardV2 } from "./cardV2";
import type { CardV3 } from "./cardV3";
import { denormalize } from "./normalize";
import { CardParseError, parseCardJson, parseCardJsonLeniently } from "./parse";

const V2_CARD = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Testina",
    description: "A V2 test card.",
    personality: "curious",
    scenario: "",
    first_mes: "Hello!",
    mes_example: "",
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: ["Hi!", "Howdy!"],
    tags: ["test"],
    creator: "TestUser",
    character_version: "1.0",
    extensions: { some_vendor_field: 42 },
    character_book: {
      extensions: {},
      entries: [
        {
          keys: ["Enchanted Forest"],
          content: "A magical forest.",
          extensions: {},
          enabled: true,
          insertion_order: 0,
        },
      ],
    },
  },
};

const V3_CARD = {
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    ...V2_CARD.data,
    name: "Testina V3",
    group_only_greetings: ["Group Hello!"],
    nickname: "Testi",
    creation_date: 1735689600,
  },
};

describe("parseCardJson", () => {
  it("parses a V2 card and marks its sourceSpec", () => {
    const normalized = parseCardJson(JSON.stringify(V2_CARD));
    expect(normalized.sourceSpec).toBe("v2");
    expect(normalized.name).toBe("Testina");
    expect(normalized.alternate_greetings).toEqual(["Hi!", "Howdy!"]);
    expect(normalized.character_book?.entries[0].keys).toEqual(["Enchanted Forest"]);
    expect((normalized.extensions as Record<string, unknown>).some_vendor_field).toBe(42);
  });

  it("parses a V3 card and keeps V3-only fields", () => {
    const normalized = parseCardJson(JSON.stringify(V3_CARD));
    expect(normalized.sourceSpec).toBe("v3");
    expect(normalized.group_only_greetings).toEqual(["Group Hello!"]);
    expect(normalized.nickname).toBe("Testi");
  });

  it("falls back to the legacy flat Tavern V1 shape when spec is absent", () => {
    const legacy = { name: "Old-Card", description: "prespec", first_mes: "Howdy" };
    const normalized = parseCardJson(JSON.stringify(legacy));
    expect(normalized.sourceSpec).toBe("v1");
    expect(normalized.name).toBe("Old-Card");
    expect(normalized.mes_example).toBe("");
  });

  it("throws CardParseError with issues for a structurally invalid V2 card", () => {
    const broken = { spec: "chara_card_v2", spec_version: "2.0", data: { /* missing name */ } };
    expect(() => parseCardJson(JSON.stringify(broken))).toThrow(CardParseError);
    try {
      parseCardJson(JSON.stringify(broken));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CardParseError);
      expect((err as CardParseError).issues?.length).toBeGreaterThan(0);
    }
  });

  it("throws CardParseError for invalid JSON", () => {
    expect(() => parseCardJson("{not json")).toThrow(CardParseError);
  });
});

describe("parseCardJsonLeniently", () => {
  /** Issues as `loadCardFromPath` actually sees them: whatever `parseCardJson` threw with. */
  function issuesFor(raw: string) {
    try {
      parseCardJson(raw);
      throw new Error("expected parseCardJson to throw");
    } catch (err) {
      if (!(err instanceof CardParseError) || !err.issues) throw err;
      return err.issues;
    }
  }

  it("recovers a V2 card whose name is missing, defaulting it to an empty string", () => {
    const broken = { ...V2_CARD, data: { ...V2_CARD.data, name: undefined } };
    const raw = JSON.stringify(broken);
    const recovered = parseCardJsonLeniently(raw, issuesFor(raw));
    expect(recovered?.name).toBe("");
    expect(recovered?.description).toBe(V2_CARD.data.description);
  });

  it("recovers a card with a malformed lorebook by dropping it, keeping everything else", () => {
    const broken = { ...V2_CARD, data: { ...V2_CARD.data, character_book: { entries: "not-an-array" } } };
    const raw = JSON.stringify(broken);
    const recovered = parseCardJsonLeniently(raw, issuesFor(raw));
    expect(recovered?.character_book).toBeUndefined();
    expect(recovered?.name).toBe(V2_CARD.data.name);
  });

  it("recovers a legacy card whose name is missing", () => {
    const raw = JSON.stringify({ description: "prespec", first_mes: "Howdy" });
    const recovered = parseCardJsonLeniently(raw, issuesFor(raw));
    expect(recovered?.sourceSpec).toBe("v1");
    expect(recovered?.name).toBe("");
  });

  it("refuses to recover a card broken in a way outside name/character_book", () => {
    const broken = { ...V2_CARD, data: { ...V2_CARD.data, description: 123 } };
    const raw = JSON.stringify(broken);
    expect(parseCardJsonLeniently(raw, issuesFor(raw))).toBeNull();
  });

  it("returns null for invalid JSON syntax — nothing to recover", () => {
    expect(parseCardJsonLeniently("{not json", [])).toBeNull();
  });
});

describe("parse -> denormalize round-trip", () => {
  it("V2 -> normalized -> V2 preserves all fields byte-for-byte relevant data", () => {
    const normalized = parseCardJson(JSON.stringify(V2_CARD));
    const rebuilt = denormalize(normalized, "v2");
    expect(rebuilt).toEqual(V2_CARD);
  });

  it("V3 -> normalized -> V3 preserves all fields", () => {
    const normalized = parseCardJson(JSON.stringify(V3_CARD));
    const rebuilt = denormalize(normalized, "v3");
    expect(rebuilt).toEqual(V3_CARD);
  });

  it("downgrading a V3 card to V2 drops V3-only fields without throwing", () => {
    const normalized = parseCardJson(JSON.stringify(V3_CARD));
    const rebuilt = denormalize(normalized, "v2") as CardV2;
    expect(rebuilt.spec).toBe("chara_card_v2");
    expect(rebuilt.data).not.toHaveProperty("group_only_greetings");
    expect(rebuilt.data).not.toHaveProperty("nickname");
    expect(rebuilt.data.name).toBe("Testina V3");
  });

  it("upgrading a V2 card to V3 fills sensible defaults for new fields", () => {
    const normalized = parseCardJson(JSON.stringify(V2_CARD));
    const rebuilt = denormalize(normalized, "v3") as CardV3;
    expect(rebuilt.spec).toBe("chara_card_v3");
    expect(rebuilt.data.group_only_greetings).toEqual([]);
  });
});
