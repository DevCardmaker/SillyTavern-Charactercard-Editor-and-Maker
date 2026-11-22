import { describe, expect, it } from "vitest";
import {
  keptAttributes,
  parseStCharacters,
  parseStGroups,
  parseStSettings,
  personasFromSettings,
  sameNameCharacters,
  withPersona,
} from "./sillyTavern";

describe("parseStCharacters", () => {
  it("reads name, file, tags and last chat, sorted by name", () => {
    const list = parseStCharacters([
      { avatar: "Ben.png", name: "Ben", date_last_chat: 1700000000000, chat_size: 120, data: { tags: ["male", 3] } },
      { avatar: "anna.png", name: "anna", date_last_chat: "2026-11-20T10:00:00Z" },
      { name: "No file" },
    ]);
    expect(list.map((c) => c.avatar)).toEqual(["anna.png", "Ben.png"]);
    expect(list[1]).toEqual({ avatar: "Ben.png", name: "Ben", tags: ["male"], lastChat: 1700000000000, chatSize: 120, fav: false, chat: "" });
    expect(list[0].lastChat).toBe(Date.parse("2026-11-20T10:00:00Z"));
  });

  it("copes with something that isn't a list", () => {
    expect(parseStCharacters({ error: true })).toEqual([]);
  });
});

describe("parseStGroups", () => {
  it("keeps the member order", () => {
    const [group] = parseStGroups([{ id: "17", name: "Familie", members: ["Cara.png", "Anna.png"], chats: ["a", "b"] }]);
    expect(group).toEqual({ id: "17", name: "Familie", members: ["Cara.png", "Anna.png"], chatCount: 2 });
  });
});

describe("personas in the settings", () => {
  const settings = parseStSettings({
    settings: JSON.stringify({
      main_api: "openai",
      power_user: {
        personas: { "1.png": "Max", "2.png": "Lea" },
        persona_descriptions: { "1.png": { description: "A traveller.", position: 1, depth: 4, lorebook: "World" } },
        other: true,
      },
    }),
  });

  it("lists every persona with its description", () => {
    expect(personasFromSettings(settings)).toEqual([
      { avatar: "2.png", name: "Lea", description: "" },
      { avatar: "1.png", name: "Max", description: "A traveller." },
    ]);
  });

  it("updates a known persona but keeps its other options and everything else", () => {
    const next = withPersona(settings, "1.png", "Maximilian", "A sailor.");
    const power = next.power_user as Record<string, any>;
    expect(power.personas["1.png"]).toBe("Maximilian");
    expect(power.persona_descriptions["1.png"]).toEqual({ description: "A sailor.", position: 1, depth: 4, lorebook: "World" });
    expect(power.other).toBe(true);
    expect(next.main_api).toBe("openai");
    // The original is not changed.
    expect((settings.power_user as Record<string, any>).personas["1.png"]).toBe("Max");
  });

  it("gives a new persona SillyTavern's defaults", () => {
    const power = withPersona(settings, "3.png", "Kim", "New.").power_user as Record<string, any>;
    expect(power.persona_descriptions["3.png"]).toEqual({ description: "New.", position: 0, depth: 2, role: 0, lorebook: "", title: "" });
    expect(Object.keys(power.personas)).toEqual(["1.png", "2.png", "3.png"]);
  });
});

describe("sameNameCharacters", () => {
  it("matches names regardless of case and spaces", () => {
    const list = parseStCharacters([{ avatar: "Anna.png", name: "Anna" }, { avatar: "Anna1.png", name: "anna " }, { avatar: "B.png", name: "Ben" }]);
    expect(sameNameCharacters(list, " ANNA").map((c) => c.avatar)).toEqual(["Anna.png", "Anna1.png"]);
    expect(sameNameCharacters(list, "")).toEqual([]);
  });
});

describe("keptAttributes", () => {
  it("brings back the favourite star and the current chat", () => {
    const [anna] = parseStCharacters([{ avatar: "Anna.png", name: "Anna", fav: true, chat: "Anna - 2026-11-20@10h00m00s" }]);
    expect(keptAttributes(anna)).toEqual({
      avatar: "Anna.png",
      fav: true,
      data: { extensions: { fav: true } },
      chat: "Anna - 2026-11-20@10h00m00s",
    });
  });

  it("reads the star from the extensions too, and leaves out an empty chat", () => {
    const [ben] = parseStCharacters([{ avatar: "Ben.png", name: "Ben", data: { extensions: { fav: true } } }]);
    expect(keptAttributes(ben)).toEqual({ avatar: "Ben.png", fav: true, data: { extensions: { fav: true } } });
  });
});
