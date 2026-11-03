import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "read_binary_file") return Array.from(fs.readFileSync(args.path as string));
    if (cmd === "list_dir_files") return fs.readdirSync(args.path as string);
    throw new Error(`unmocked command: ${cmd}`);
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: async () => null, open: async () => null, confirm: async () => true }));

const { listCardVersions, parseVersionFileName, readCardVersion, sameImage } = await import("./cardHistory");
const { embedCardJson } = await import("../png/characterCard");
const { buildMinimalPng } = await import("../png/testFixtures");

const cardJson = (name: string) =>
  JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name,
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "",
      extensions: {},
    },
  });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-history-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("parseVersionFileName", () => {
  it("reads the time of a normal save's copy", () => {
    const parsed = parseVersionFileName("Anna.2026-11-03T20-49-36.png", ["Anna"]);
    expect(parsed?.reason).toBeNull();
    expect(parsed?.time).toEqual(new Date(2026, 10, 3, 20, 49, 36));
  });

  it("reads the reason of a snapshot before an AI change", () => {
    expect(parseVersionFileName("Anna.before-condense.2026-11-03T20-49-36.json", ["Anna"])?.reason).toBe("before-condense");
  });

  it("handles names with dots, and doesn't mix up similar names", () => {
    expect(parseVersionFileName("Dr. Anna.2026-11-03T20-49-36.png", ["Dr. Anna"])).not.toBeNull();
    expect(parseVersionFileName("Anna Maria.2026-11-03T20-49-36.png", ["Anna"])).toBeNull();
    expect(parseVersionFileName("Anna.Maria.other.2026-11-03T20-49-36.png", ["Anna"])).toBeNull();
    expect(parseVersionFileName("Anna.png", ["Anna"])).toBeNull();
    expect(parseVersionFileName("Anna.2026-11-03T20-49-36.png", [""])).toBeNull();
  });
});

describe("listCardVersions", () => {
  it("is empty without a file or a backups folder", async () => {
    expect(await listCardVersions(null, "Anna")).toEqual([]);
    expect(await listCardVersions(path.join(dir, "Anna.png"), "Anna")).toEqual([]);
  });

  it("lists this card's copies newest first, under the file's or the card's name", async () => {
    fs.mkdirSync(path.join(dir, "backups"));
    for (const name of [
      "file.2026-01-01T10-00-00.png",
      "file.2026-03-01T10-00-00.png",
      "Anna.before-condense.2026-02-01T10-00-00.json",
      "other.2026-04-01T10-00-00.png",
    ]) {
      fs.writeFileSync(path.join(dir, "backups", name), "");
    }
    const versions = await listCardVersions(path.join(dir, "file.png"), "Anna");
    expect(versions.map((v) => v.time.getMonth())).toEqual([2, 1, 0]);
    expect(versions[1].reason).toBe("before-condense");
    expect(versions[0].path).toBe(`${dir}/backups/file.2026-03-01T10-00-00.png`);
  });
});

describe("readCardVersion", () => {
  it("reads JSON and PNG cards", async () => {
    const json = path.join(dir, "a.json");
    fs.writeFileSync(json, cardJson("Anna"));
    expect((await readCardVersion(json)).card.name).toBe("Anna");
    expect((await readCardVersion(json)).avatarPng).toBeNull();

    const png = path.join(dir, "a.png");
    fs.writeFileSync(png, embedCardJson(buildMinimalPng(), cardJson("Berta")));
    const read = await readCardVersion(png);
    expect(read.card.name).toBe("Berta");
    expect(read.avatarPng).not.toBeNull();
  });

  it("says so when a PNG holds no card", async () => {
    const png = path.join(dir, "plain.png");
    fs.writeFileSync(png, buildMinimalPng());
    await expect(readCardVersion(png)).rejects.toThrow(/doesn't contain/);
  });
});

describe("sameImage", () => {
  it("ignores the card text inside the PNG", () => {
    const a = embedCardJson(buildMinimalPng(), cardJson("Anna"));
    const b = embedCardJson(buildMinimalPng(), cardJson("Berta"));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(sameImage(a, b)).toBe(true);
  });

  it("treats a missing image as different from one that exists", () => {
    expect(sameImage(null, buildMinimalPng())).toBe(false);
    expect(sameImage(null, null)).toBe(true);
  });
});
