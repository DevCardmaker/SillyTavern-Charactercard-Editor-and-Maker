import { describe, expect, it } from "vitest";
import {
  getGroupGreetingMode,
  GROUP_GREETING_MODE,
  resolveGroupGreetings,
  withGroupGreetingMode,
  withLegacyGroupGreetings,
} from "./groupGreetings";
import { createBlankCard, denormalize, type NormalizedCard } from "./normalize";
import { parseCardJson } from "./parse";
import type { CardV2 } from "./cardV2";
import type { CardV3 } from "./cardV3";

const fileWith = (spec: "v2" | "v3", data: Record<string, unknown>) =>
  JSON.stringify(
    spec === "v2"
      ? { spec: "chara_card_v2", spec_version: "2.0", data: { name: "A", ...data } }
      : { spec: "chara_card_v3", spec_version: "3.0", data: { name: "A", ...data } },
  );

describe("resolveGroupGreetings", () => {
  it("prefers the V3 field and falls back to the older one, like the extension", () => {
    expect(resolveGroupGreetings({ group_only_greetings: ["new"], extensions: { group_greetings: ["old"] } })).toEqual(["new"]);
    expect(resolveGroupGreetings({ group_only_greetings: [], extensions: { group_greetings: ["old"] } })).toEqual(["old"]);
    expect(resolveGroupGreetings({ extensions: { group_greetings: ["old"] } })).toEqual(["old"]);
    expect(resolveGroupGreetings({ extensions: {} })).toEqual([]);
  });

  it("ignores anything that isn't a list of strings", () => {
    expect(resolveGroupGreetings({ group_only_greetings: "nope", extensions: { group_greetings: [1, "ok"] } })).toEqual(["ok"]);
  });
});

describe("loading", () => {
  it("shows a V2 card's greetings from either place", () => {
    expect(parseCardJson(fileWith("v2", { extensions: { group_greetings: ["old"] } })).group_only_greetings).toEqual(["old"]);
    expect(parseCardJson(fileWith("v2", { group_only_greetings: ["kept"], extensions: {} })).group_only_greetings).toEqual(["kept"]);
  });

  it("shows a V3 card's older list when its V3 field is empty", () => {
    const card = parseCardJson(fileWith("v3", { group_only_greetings: [], extensions: { group_greetings: ["old"] } }));
    expect(card.group_only_greetings).toEqual(["old"]);
  });
});

describe("saving", () => {
  it("keeps a V2 card's greetings in the extensions, the only place it has", () => {
    const card: NormalizedCard = { ...parseCardJson(fileWith("v2", {})), group_only_greetings: ["Hi all"] };
    const saved = denormalize(card, "v2") as CardV2;
    expect(saved.data.extensions.group_greetings).toEqual(["Hi all"]);
    expect(saved.data).not.toHaveProperty("group_only_greetings");
    expect(parseCardJson(JSON.stringify(saved)).group_only_greetings).toEqual(["Hi all"]);
  });

  it("adds nothing to a V2 card without group greetings", () => {
    const saved = denormalize(parseCardJson(fileWith("v2", {})), "v2") as CardV2;
    expect(saved.data.extensions).not.toHaveProperty("group_greetings");
  });

  it("adds no older field to a V3 card that doesn't have one", () => {
    const card: NormalizedCard = { ...createBlankCard(), name: "A", group_only_greetings: ["Hi all"] };
    const saved = denormalize(card, "v3") as CardV3;
    expect(saved.data.group_only_greetings).toEqual(["Hi all"]);
    expect(saved.data.extensions).not.toHaveProperty("group_greetings");
  });

  it("updates an existing older list, so a removed greeting doesn't come back", () => {
    for (const spec of ["v2", "v3"] as const) {
      const loaded = parseCardJson(fileWith(spec, { group_only_greetings: ["a"], extensions: { group_greetings: ["a"] } }));
      const saved = denormalize({ ...loaded, group_only_greetings: [] }, spec);
      expect(parseCardJson(JSON.stringify(saved)).group_only_greetings).toEqual([]);
    }
  });

  it("doesn't change the object it's given", () => {
    const data = { group_only_greetings: ["a"], extensions: {} };
    withLegacyGroupGreetings(data, "v2");
    expect(data.extensions).toEqual({});
  });
});

describe("mode", () => {
  it("defaults to random, and keeps the other extensions", () => {
    expect(getGroupGreetingMode({})).toBe(GROUP_GREETING_MODE.RANDOM);
    const extensions = withGroupGreetingMode({ other: 1 }, GROUP_GREETING_MODE.PICK);
    expect(extensions).toEqual({ other: 1, group_greetings_mode: 1 });
    expect(getGroupGreetingMode(extensions)).toBe(GROUP_GREETING_MODE.PICK);
  });
});
