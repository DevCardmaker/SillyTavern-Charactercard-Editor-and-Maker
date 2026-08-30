import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same real-filesystem redirection approach as fileIO.test.ts: mirror what the Rust commands
// actually do (incl. parent-dir creation on write) instead of a mock that just records calls.
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

const { loadPromptPresets, savePromptPresets } = await import("./promptPresets");

describe("loadPromptPresets / savePromptPresets", () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("seeds and persists the default presets on first run", async () => {
    const presets = await loadPromptPresets();

    expect(presets.system_prompt.map((p) => p.label)).toEqual([
      "Slapstick",
      "Serious",
      "Third Person",
      "First Person",
    ]);
    expect(presets.post_history_instructions).toEqual([]);

    // the seed must actually have been written to disk, not just returned in memory
    const onDisk = fs.readFileSync(path.join(configDir, "prompt-presets.json"), "utf-8");
    expect(JSON.parse(onDisk).system_prompt).toHaveLength(4);
  });

  it("loads whatever was previously saved instead of re-seeding", async () => {
    await savePromptPresets({
      system_prompt: [{ id: "a", label: "Custom", text: "My text" }],
      post_history_instructions: [],
    });

    const presets = await loadPromptPresets();
    expect(presets.system_prompt).toEqual([{ id: "a", label: "Custom", text: "My text" }]);
  });

  it("falls back to defaults if the config file is corrupted", async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "prompt-presets.json"), "{ not valid json");

    const presets = await loadPromptPresets();
    expect(presets.system_prompt.map((p) => p.label)).toContain("Slapstick");
  });
});
