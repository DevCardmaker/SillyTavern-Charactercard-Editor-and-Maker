import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "write_binary_file") {
      const target = args.path as string;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(args.data as number[]));
      return;
    }
    if (cmd === "delete_file") {
      try {
        fs.rmSync(args.path as string);
      } catch {
        // matches the Rust command treating "already gone" as success
      }
      return;
    }
    throw new Error(`unmocked command: ${cmd}`);
  },
}));

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-autosave-test-"));
afterAll(() => fs.rmSync(configDir, { recursive: true, force: true }));
vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: async () => configDir,
  join: async (...parts: string[]) => path.join(...parts),
}));

const { writeAutosave, clearAutosave } = await import("./autosave");
const { createBlankCard } = await import("../schema/normalize");

function autosaveFile(slotId: string): string {
  return path.join(configDir, "autosave", `${slotId}.json`);
}

describe("autosave", () => {
  beforeEach(() => {
    fs.rmSync(path.join(configDir, "autosave"), { recursive: true, force: true });
  });

  it("writeAutosave writes the card's JSON to a per-slot file under the autosave folder", async () => {
    const card = { ...createBlankCard(), name: "Father" };

    await writeAutosave("slot-1", card);

    const written = JSON.parse(fs.readFileSync(autosaveFile("slot-1"), "utf-8"));
    expect(written.data.name).toBe("Father");
  });

  it("clearAutosave removes a previously written snapshot", async () => {
    await writeAutosave("slot-2", { ...createBlankCard(), name: "Mother" });
    expect(fs.existsSync(autosaveFile("slot-2"))).toBe(true);

    await clearAutosave("slot-2");

    expect(fs.existsSync(autosaveFile("slot-2"))).toBe(false);
  });

  it("clearAutosave on a slot that was never written is a harmless no-op", async () => {
    await expect(clearAutosave("never-written")).resolves.toBeUndefined();
  });
});
