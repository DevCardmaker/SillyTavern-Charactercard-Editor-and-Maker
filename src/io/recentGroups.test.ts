import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "read_binary_file") {
      return Array.from(fs.readFileSync(args.path as string));
    }
    if (cmd === "write_binary_file") {
      const target = args.path as string;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(args.data as number[]));
      return;
    }
    throw new Error(`unmocked command: ${cmd}`);
  },
}));

let configDir = "";
vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: async () => configDir,
  join: async (...parts: string[]) => path.join(...parts),
}));

const { groupLabel, loadRecentGroups, recordRecentGroup, removeRecentGroup } = await import("./recentGroups");

describe("recent groups", () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-groups-test-"));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("starts empty and ignores a single card", async () => {
    expect(await loadRecentGroups()).toEqual([]);
    expect(await recordRecentGroup(["/c/Anna.png"])).toEqual([]);
  });

  it("puts a reopened group in front, whatever the order of its cards", async () => {
    await recordRecentGroup(["/f/Anna.png", "/f/Ben.png"]);
    await recordRecentGroup(["/g/Cara.png", "/g/Dan.png"]);
    const groups = await recordRecentGroup(["/f/Ben.png", "/f/Anna.png"]);
    expect(groups).toHaveLength(2);
    expect(groups[0].paths).toEqual(["/f/Ben.png", "/f/Anna.png"]);
  });

  it("keeps only the 5 most recent groups", async () => {
    for (let i = 0; i < 7; i++) await recordRecentGroup([`/g${i}/a.png`, `/g${i}/b.png`]);
    const groups = await loadRecentGroups();
    expect(groups).toHaveLength(5);
    expect(groups[0].paths[0]).toBe("/g6/a.png");
  });

  it("removes a group and survives a broken file", async () => {
    await recordRecentGroup(["/f/Anna.png", "/f/Ben.png"]);
    expect(await removeRecentGroup(["/f/Ben.png", "/f/Anna.png"])).toEqual([]);
    fs.writeFileSync(path.join(configDir, "recent-groups.json"), "{kaputt");
    expect(await loadRecentGroups()).toEqual([]);
  });

  it("is named after the shared folder, otherwise after its first cards", () => {
    expect(groupLabel(["/home/x/Familie Berg/Anna.png", "/home/x/Familie Berg/Ben.json"])).toBe("Familie Berg");
    expect(groupLabel(["C:\\Karten\\Anna.png", "C:\\Karten\\Ben.png"])).toBe("Karten");
    expect(groupLabel(["/a/Anna.png", "/b/Ben.png", "/c/Cara.png", "/d/Dan.png"])).toBe("Anna, Ben, Cara +1");
  });
});
