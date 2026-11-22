import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildGroupx, parseGroupx } from "./groupx";

const bytes = (text: string) => strToU8(text);

describe("GroupX", () => {
  it("keeps cards, their order and lorebooks through a round trip", () => {
    const file = buildGroupx({
      name: "Familie Berg",
      members: [
        { fileName: "Cara.png", bytes: Uint8Array.from([137, 80, 78, 71, 1]), name: "Cara" },
        { fileName: "Anna.json", bytes: bytes('{"name":"Anna"}'), name: "Anna" },
        { fileName: "Anna.json", bytes: bytes('{"name":"Anna 2"}'), name: "Anna" },
      ],
      lorebooks: [{ fileName: "Berg: Welt.json", bytes: bytes('{"entries":{}}') }],
    });
    const group = parseGroupx(file);
    expect(group.name).toBe("Familie Berg");
    expect(group.members.map((m) => m.fileName)).toEqual(["Cara.png", "Anna.json", "Anna-2.json"]);
    expect(group.members.map((m) => m.name)).toEqual(["Cara", "Anna", "Anna"]);
    expect(Array.from(group.members[0].bytes)).toEqual([137, 80, 78, 71, 1]);
    expect(group.lorebooks.map((b) => b.fileName)).toEqual(["Berg Welt.json"]);
  });

  it("says clearly what's wrong with a file that isn't one", () => {
    expect(() => parseGroupx(bytes("hello"))).toThrow(/not a ZIP/);
    expect(() => parseGroupx(zipSync({ "card.json": bytes("{}") }))).toThrow(/group.json is missing/);
    expect(() => parseGroupx(zipSync({ "group.json": bytes('{"spec":"chara_card_v3"}') }))).toThrow(/isn't a GroupX/);
    expect(() =>
      parseGroupx(zipSync({ "group.json": bytes('{"spec":"groupx","members":[{"file":"cards/A.png"}]}') })),
    ).toThrow(/cards\/A.png, but the file is missing/);
  });
});
