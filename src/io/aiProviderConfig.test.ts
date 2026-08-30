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

const { loadAiProviderConfig, saveAiProviderConfig } = await import("./aiProviderConfig");

describe("loadAiProviderConfig / saveAiProviderConfig", () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("seeds and persists an empty profile list on first run", async () => {
    const config = await loadAiProviderConfig();
    expect(config).toEqual({ profiles: [], activeProfileId: null });

    const onDisk = fs.readFileSync(path.join(configDir, "ai-provider-config.json"), "utf-8");
    expect(JSON.parse(onDisk)).toEqual({ profiles: [], activeProfileId: null });
  });

  it("loads whatever was previously saved instead of re-seeding", async () => {
    const saved = {
      profiles: [{ id: "a", label: "Lokal", baseUrl: "http://localhost:5001", apiKey: "x", model: "magnum-v4-72b" }],
      activeProfileId: "a",
    };
    await saveAiProviderConfig(saved);

    const config = await loadAiProviderConfig();
    expect(config).toEqual(saved);
  });

  it("falls back to defaults if the config file is corrupted", async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "ai-provider-config.json"), "{ not valid json");

    const config = await loadAiProviderConfig();
    expect(config).toEqual({ profiles: [], activeProfileId: null });
  });

  it("migrates the legacy single-object shape into one profile", async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "ai-provider-config.json"),
      JSON.stringify({ baseUrl: "http://localhost:5001", apiKey: "x", model: "magnum-v4-72b" }),
    );

    const config = await loadAiProviderConfig();
    expect(config.profiles).toHaveLength(1);
    expect(config.profiles[0]).toMatchObject({
      label: "Migrated",
      baseUrl: "http://localhost:5001",
      apiKey: "x",
      model: "magnum-v4-72b",
    });
    expect(config.activeProfileId).toBe(config.profiles[0].id);

    const onDisk = JSON.parse(fs.readFileSync(path.join(configDir, "ai-provider-config.json"), "utf-8"));
    expect(onDisk).toEqual(config);
  });
});
