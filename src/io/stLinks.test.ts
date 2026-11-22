import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "read_binary_file") return Array.from(fs.readFileSync(args.path as string));
    if (cmd === "write_binary_file") {
      fs.mkdirSync(path.dirname(args.path as string), { recursive: true });
      fs.writeFileSync(args.path as string, Buffer.from(args.data as number[]));
      return;
    }
    throw new Error(`unmocked command: ${cmd}`);
  },
}));
let configDir = "";
vi.mock("@tauri-apps/api/path", () => ({ appConfigDir: async () => configDir, join: async (...p: string[]) => path.join(...p) }));

const { loadStLinks, saveStLinks } = await import("./stLinks");

describe("SillyTavern links", () => {
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-links-"));
  });
  afterEach(() => fs.rmSync(configDir, { recursive: true, force: true }));

  it("starts empty and keeps what was saved", async () => {
    expect(await loadStLinks()).toEqual({ cards: {}, personas: {} });
    await saveStLinks({ cards: { "/cards/Anna.png": "Anna.png" }, personas: { "/p/Max.png": "1.png" } });
    expect(await loadStLinks()).toEqual({ cards: { "/cards/Anna.png": "Anna.png" }, personas: { "/p/Max.png": "1.png" } });
  });

  it("ignores a broken file and entries that aren't names", async () => {
    fs.writeFileSync(path.join(configDir, "sillytavern-links.json"), JSON.stringify({ cards: { a: "A.png", b: 3 }, personas: [] }));
    expect(await loadStLinks()).toEqual({ cards: { a: "A.png" }, personas: {} });
    fs.writeFileSync(path.join(configDir, "sillytavern-links.json"), "{kaputt");
    expect(await loadStLinks()).toEqual({ cards: {}, personas: {} });
  });
});
