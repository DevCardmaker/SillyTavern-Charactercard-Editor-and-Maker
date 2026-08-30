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

const { loadRecentCards, recordRecentCard, removeRecentCards } = await import("./recentCards");

describe("loadRecentCards / recordRecentCard", () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("returns an empty list when nothing has been opened yet", async () => {
    expect(await loadRecentCards()).toEqual([]);
  });

  it("adds newly opened cards to the front", async () => {
    await recordRecentCard("/cards/A.png");
    const result = await recordRecentCard("/cards/B.png");
    expect(result).toEqual(["/cards/B.png", "/cards/A.png"]);
  });

  it("moves a re-opened card to the front instead of duplicating it", async () => {
    await recordRecentCard("/cards/A.png");
    await recordRecentCard("/cards/B.png");
    const result = await recordRecentCard("/cards/A.png");
    expect(result).toEqual(["/cards/A.png", "/cards/B.png"]);
  });

  it("keeps only the 5 most recent entries", async () => {
    for (let i = 1; i <= 7; i++) {
      await recordRecentCard(`/cards/${i}.png`);
    }
    const result = await loadRecentCards();
    expect(result).toEqual(["/cards/7.png", "/cards/6.png", "/cards/5.png", "/cards/4.png", "/cards/3.png"]);
  });

  it("falls back to an empty list if the config file is corrupted", async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "recent-cards.json"), "not json");
    expect(await loadRecentCards()).toEqual([]);
  });

  it("drops the given paths from the list in one write", async () => {
    await recordRecentCard("/cards/A.png");
    await recordRecentCard("/cards/B.png");
    await recordRecentCard("/cards/C.png");
    const result = await removeRecentCards(["/cards/A.png", "/cards/C.png"]);
    expect(result).toEqual(["/cards/B.png"]);
    expect(await loadRecentCards()).toEqual(["/cards/B.png"]);
  });

  it("is a no-op when none of the given paths are in the list", async () => {
    await recordRecentCard("/cards/A.png");
    const result = await removeRecentCards(["/cards/nonexistent.png"]);
    expect(result).toEqual(["/cards/A.png"]);
  });
});
