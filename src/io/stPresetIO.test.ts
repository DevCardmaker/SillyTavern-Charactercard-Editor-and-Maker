import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "read_binary_file") return Array.from(fs.readFileSync(args.path as string));
    if (cmd === "write_binary_file") {
      const target = args.path as string;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(args.data as number[]));
      return;
    }
    throw new Error(`unmocked command: ${cmd}`);
  },
}));

const mockSave = vi.fn<() => Promise<string | null>>();
const mockConfirm = vi.fn<() => Promise<boolean>>();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: () => mockSave(),
  open: async () => null,
  confirm: () => mockConfirm(),
}));

const { openPresetPaths, saveActivePreset } = await import("./stPresetIO");
const { useStPresetStore } = await import("../state/stPresetStore");
const { updatePrompt } = await import("../schema/stPreset");

const PRESET = JSON.stringify(
  {
    temperature: 1,
    extensions: { regex_scripts: [{ id: "keep" }] },
    prompts: [{ identifier: "a", content: "old", system_prompt: false, marker: false }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: "a", enabled: true }] }],
  },
  null,
  4,
);

let dir: string;
let file: string;
const backups = () => (fs.existsSync(path.join(dir, "backups")) ? fs.readdirSync(path.join(dir, "backups")) : []);
const editActive = () => {
  const { presets, activeId, updateActive } = useStPresetStore.getState();
  const slot = presets.find((p) => p.id === activeId);
  if (slot) updateActive(updatePrompt(slot.preset, "a", { content: "new" }));
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-preset-"));
  file = path.join(dir, "My preset.json");
  fs.writeFileSync(file, PRESET);
  useStPresetStore.setState({ presets: [], activeId: null });
  mockConfirm.mockReset();
  mockSave.mockReset();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("opening", () => {
  it("reports files it can't read, and still opens the others", async () => {
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, '{"temp": 1}');
    const failed = await openPresetPaths([bad, file]);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain("bad.json");
    expect(useStPresetStore.getState().presets).toHaveLength(1);
  });

  it("switches to a file that is already open instead of opening it twice", async () => {
    await openPresetPaths([file, file]);
    expect(useStPresetStore.getState().presets).toHaveLength(1);
  });
});

describe("saving", () => {
  it("writes the edit, keeps the rest and makes a backup of the old file", async () => {
    await openPresetPaths([file]);
    editActive();
    await saveActivePreset("save");

    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.prompts[0].content).toBe("new");
    expect(written.temperature).toBe(1);
    expect(written.extensions.regex_scripts).toEqual([{ id: "keep" }]);
    expect(useStPresetStore.getState().presets[0].isDirty).toBe(false);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(backups()).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, "backups", backups()[0]), "utf8")).toBe(PRESET);
  });

  it("an unedited file comes out byte for byte the same", async () => {
    await openPresetPaths([file]);
    await saveActivePreset("save");
    expect(fs.readFileSync(file, "utf8")).toBe(PRESET);
  });

  it("asks before overwriting a file another program changed, and keeps it on no", async () => {
    await openPresetPaths([file]);
    editActive();
    fs.writeFileSync(file, `${PRESET}\n`);
    mockConfirm.mockResolvedValue(false);
    await saveActivePreset("save");
    expect(mockConfirm).toHaveBeenCalledOnce();
    expect(fs.readFileSync(file, "utf8")).toBe(`${PRESET}\n`);
    expect(useStPresetStore.getState().presets[0].isDirty).toBe(true);
  });

  it("overwrites on yes, and doesn't ask again on the next save", async () => {
    await openPresetPaths([file]);
    editActive();
    fs.writeFileSync(file, `${PRESET}\n`);
    mockConfirm.mockResolvedValue(true);
    await saveActivePreset("save");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).prompts[0].content).toBe("new");
    await saveActivePreset("save");
    expect(mockConfirm).toHaveBeenCalledOnce();
  });

  it("Save As writes a new file and continues on it", async () => {
    const copy = path.join(dir, "copy.json");
    await openPresetPaths([file]);
    editActive();
    mockSave.mockResolvedValue(copy);
    await saveActivePreset("saveAs");
    expect(fs.readFileSync(file, "utf8")).toBe(PRESET);
    expect(JSON.parse(fs.readFileSync(copy, "utf8")).prompts[0].content).toBe("new");
    expect(useStPresetStore.getState().presets[0].path).toBe(copy);
  });
});
