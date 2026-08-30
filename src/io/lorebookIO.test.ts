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

const mockSaveDialog = vi.fn<() => Promise<string | null>>();
const mockOpenDialog = vi.fn<() => Promise<string | null>>();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: () => mockSaveDialog(),
  open: () => mockOpenDialog(),
}));

const { exportLorebook, importLorebook, mergeLorebookEntries } = await import("./lorebookIO");

const SAMPLE_BOOK = {
  name: "Enchanted Forest",
  extensions: {},
  entries: [
    { keys: ["Forest"], content: "A magical place.", extensions: {}, enabled: true, insertion_order: 0 },
  ],
};

describe("exportLorebook / importLorebook", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
    mockSaveDialog.mockReset();
    mockOpenDialog.mockReset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exports a lorebook and re-imports it unchanged", async () => {
    const target = path.join(dir, "Enchanted Forest.json");
    mockSaveDialog.mockResolvedValueOnce(target);

    await exportLorebook(SAMPLE_BOOK);
    expect(JSON.parse(fs.readFileSync(target, "utf-8"))).toEqual(SAMPLE_BOOK);

    mockOpenDialog.mockResolvedValueOnce(target);
    const imported = await importLorebook();
    expect(imported).toEqual(SAMPLE_BOOK);
  });

  it("does nothing on export if the save dialog is cancelled", async () => {
    mockSaveDialog.mockResolvedValueOnce(null);
    await exportLorebook(SAMPLE_BOOK);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it("returns null on import if the open dialog is cancelled", async () => {
    mockOpenDialog.mockResolvedValueOnce(null);
    expect(await importLorebook()).toBeNull();
  });

  it("rejects a file that isn't a valid lorebook", async () => {
    const target = path.join(dir, "not-a-lorebook.json");
    fs.writeFileSync(target, JSON.stringify({ hello: "world" }));
    mockOpenDialog.mockResolvedValueOnce(target);

    await expect(importLorebook()).rejects.toThrow();
  });
});

describe("mergeLorebookEntries", () => {
  it("appends new entries to an existing book without touching existing ones or other fields", () => {
    const merged = mergeLorebookEntries(SAMPLE_BOOK, [{ keys: ["Elara"], content: "The mother.", comment: "Mother Elara" }]);

    expect(merged.name).toBe("Enchanted Forest");
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[0]).toEqual(SAMPLE_BOOK.entries[0]);
    expect(merged.entries[1]).toEqual({
      keys: ["Elara"],
      content: "The mother.",
      comment: "Mother Elara",
      extensions: {},
      enabled: true,
      insertion_order: 0,
    });
  });

  it("creates a fresh book when the card doesn't have one yet", () => {
    const merged = mergeLorebookEntries(undefined, [{ keys: ["Jonas"], content: "Bester Freund." }]);

    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0]).toMatchObject({ keys: ["Jonas"], content: "Bester Freund." });
  });
});
