import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Redirect the Tauri IPC calls fileIO.ts makes to real filesystem operations, mirroring what
// the Rust commands do (read_binary_file / write_binary_file incl. parent-dir creation) — this
// lets backupExistingFile's actual path/filename logic run against a real temp directory instead
// of a mock that just records calls.
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
    if (cmd === "list_dir_files") {
      return fs.readdirSync(args.path as string).filter((name) => fs.statSync(path.join(args.path as string, name)).isFile());
    }
    throw new Error(`unmocked command: ${cmd}`);
  },
}));

const mockSaveDialog = vi.fn<() => Promise<string | null>>();
const mockOpenDialog = vi.fn<() => Promise<string | string[] | null>>();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: () => mockSaveDialog(),
  open: () => mockOpenDialog(),
}));

// loadCardFromPath/saveCard also record recent-cards.json via appConfigDir() — none of these
// tests assert on that file, it just needs a real writable directory so the side effect doesn't throw.
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-appconfig-test-"));
afterAll(() => fs.rmSync(configDir, { recursive: true, force: true }));
vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: async () => configDir,
  join: async (...parts: string[]) => path.join(...parts),
}));

const { backupExistingFile, saveCard, saveCardAsCopy, openCardFile, openCardAtPath, openFolderAsTabs, saveGroupToFolder } =
  await import("./fileIO");
const { createBlankCard } = await import("../schema/normalize");
const { useCardStore } = await import("../state/cardStore");
const { buildMinimalPng } = await import("../png/testFixtures");
const { embedCardJson } = await import("../png/characterCard");

// The store's `card`/`avatarPng`/`currentFilePath`/`currentFileFormat`/`isDirty` fields are a
// mirror of `characters.find(c => c.id === activeId)`, kept in sync by the store's own actions
// (see cardStore.ts) — fileIO.ts reads the flat mirror, while markSaved/updateCard etc. look the
// slot up via characters/activeId, so test setup has to set both consistently.
function setSingleActiveCard(overrides: {
  card: ReturnType<typeof createBlankCard>;
  avatarPng?: Uint8Array | null;
  currentFilePath?: string | null;
  currentFileFormat?: "png" | "json" | null;
  isDirty?: boolean;
}) {
  const slot = {
    id: "test-slot",
    card: overrides.card,
    avatarPng: overrides.avatarPng ?? null,
    currentFilePath: overrides.currentFilePath ?? null,
    currentFileFormat: overrides.currentFileFormat ?? null,
    isDirty: overrides.isDirty ?? false,
  };
  useCardStore.setState({
    characters: [slot],
    activeId: slot.id,
    card: slot.card,
    avatarPng: slot.avatarPng,
    currentFilePath: slot.currentFilePath,
    currentFileFormat: slot.currentFileFormat,
    isDirty: slot.isDirty,
  });
}

function resetToNoCardsOpen() {
  useCardStore.setState({
    characters: [],
    activeId: null,
    card: null,
    avatarPng: null,
    currentFilePath: null,
    currentFileFormat: null,
    isDirty: false,
  });
}

function minimalV2CardJson(name: string): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name,
      description: "",
      personality: "",
      scenario: "",
      first_mes: "Hello!",
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
}

describe("backupExistingFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing when the target file doesn't exist yet (new card, first save)", async () => {
    const target = path.join(dir, "Knight.png");
    await backupExistingFile(target);
    expect(fs.existsSync(path.join(dir, "backups"))).toBe(false);
  });

  it("copies the existing file into a timestamped backups/ sibling before it gets overwritten", async () => {
    const target = path.join(dir, "Knight.png");
    fs.writeFileSync(target, "original bytes");

    await backupExistingFile(target);

    const backupDir = path.join(dir, "backups");
    expect(fs.existsSync(backupDir)).toBe(true);
    const backups = fs.readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^Knight\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.png$/);
    expect(fs.readFileSync(path.join(backupDir, backups[0]), "utf-8")).toBe("original bytes");

    // the original at `target` itself must be untouched by the backup step
    expect(fs.readFileSync(target, "utf-8")).toBe("original bytes");
  });

  it("preserves the extension for JSON cards", async () => {
    const target = path.join(dir, "Knight.json");
    fs.writeFileSync(target, "{}");

    await backupExistingFile(target);

    const backups = fs.readdirSync(path.join(dir, "backups"));
    expect(backups[0]).toMatch(/\.json$/);
  });
});

describe("saveCardAsCopy", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
    mockSaveDialog.mockReset();
    setSingleActiveCard({
      card: { ...createBlankCard(), name: "Aragorn" },
      currentFilePath: "/original/Aragorn.json",
      currentFileFormat: "json",
      isDirty: true,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the card to the chosen path without redirecting the current working file", async () => {
    const target = path.join(dir, "Aragorn-Copy.json");
    mockSaveDialog.mockResolvedValueOnce(target);

    await saveCardAsCopy();

    expect(fs.existsSync(target)).toBe(true);
    expect(JSON.parse(fs.readFileSync(target, "utf-8")).data.name).toBe("Aragorn");

    // "Save" must still target the original file — the copy is a side export, not a switch
    const state = useCardStore.getState();
    expect(state.currentFilePath).toBe("/original/Aragorn.json");
    expect(state.currentFileFormat).toBe("json");
    expect(state.isDirty).toBe(true);
  });

  it("does nothing if the save dialog is cancelled", async () => {
    mockSaveDialog.mockResolvedValueOnce(null);
    await saveCardAsCopy();
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });
});

// openCardFile (via the file dialog) and openCardAtPath (via drag & drop) share the same
// loading path, so one set of cases covers both entry points.
describe("opening a card file", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
    mockOpenDialog.mockReset();
    resetToNoCardsOpen();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("openCardFile loads a JSON card picked via the dialog", async () => {
    const target = path.join(dir, "Aragorn.json");
    fs.writeFileSync(target, minimalV2CardJson("Aragorn"));
    mockOpenDialog.mockResolvedValueOnce(target);

    await openCardFile();

    const state = useCardStore.getState();
    expect(state.card?.name).toBe("Aragorn");
    expect(state.currentFilePath).toBe(target);
    expect(state.currentFileFormat).toBe("json");
    expect(state.isDirty).toBe(false);

    const recent = JSON.parse(fs.readFileSync(path.join(configDir, "recent-cards.json"), "utf-8"));
    expect(recent).toContain(target);
  });

  it("openCardAtPath loads a PNG card with an embedded chara chunk", async () => {
    const target = path.join(dir, "Legolas.png");
    const png = embedCardJson(buildMinimalPng(), minimalV2CardJson("Legolas"));
    fs.writeFileSync(target, png);

    await openCardAtPath(target);

    const state = useCardStore.getState();
    expect(state.card?.name).toBe("Legolas");
    expect(state.currentFileFormat).toBe("png");
    expect(state.avatarPng).not.toBeNull();
  });

  it("openCardAtPath rejects a PNG without an embedded card", async () => {
    const target = path.join(dir, "just-a-picture.png");
    fs.writeFileSync(target, buildMinimalPng());

    await expect(openCardAtPath(target)).rejects.toThrow(/doesn.t contain/);
    expect(useCardStore.getState().card).toBeNull();
  });

  it("openCardAtPath rejects a file that isn't .png/.json without touching the filesystem", async () => {
    const target = path.join(dir, "notes.txt");
    fs.writeFileSync(target, "not a card");

    await expect(openCardAtPath(target)).rejects.toThrow(/\.png and \.json files/);
    expect(useCardStore.getState().card).toBeNull();
  });
});

describe("saveCard", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes to the current file, clears the dirty flag and records it as recently opened", async () => {
    const target = path.join(dir, "Aragorn.json");
    setSingleActiveCard({
      card: { ...createBlankCard(), name: "Aragorn" },
      currentFilePath: target,
      currentFileFormat: "json",
      isDirty: true,
    });

    await saveCard("save");

    expect(JSON.parse(fs.readFileSync(target, "utf-8")).data.name).toBe("Aragorn");
    expect(useCardStore.getState().isDirty).toBe(false);

    const recent = JSON.parse(fs.readFileSync(path.join(configDir, "recent-cards.json"), "utf-8"));
    expect(recent).toContain(target);
  });

  it("upgrades a json-tracked card to png when an avatar is set, instead of silently dropping it", async () => {
    const jsonPath = path.join(dir, "Aragorn.json");
    fs.writeFileSync(jsonPath, "stale json from before the avatar was added");
    setSingleActiveCard({
      card: { ...createBlankCard(), name: "Aragorn" },
      avatarPng: buildMinimalPng(),
      currentFilePath: jsonPath,
      currentFileFormat: "json",
      isDirty: true,
    });

    await saveCard("save");

    const pngPath = path.join(dir, "Aragorn.png");
    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.readFileSync(jsonPath, "utf-8")).toBe("stale json from before the avatar was added");
    expect(useCardStore.getState().currentFilePath).toBe(pngPath);
    expect(useCardStore.getState().currentFileFormat).toBe("png");
    expect(useCardStore.getState().isDirty).toBe(false);
  });
});

describe("openFolderAsTabs", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
    mockOpenDialog.mockReset();
    resetToNoCardsOpen();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("opens every valid card in the chosen folder as its own tab, skipping files that don't load", async () => {
    fs.writeFileSync(path.join(dir, "Father.json"), minimalV2CardJson("Father"));
    fs.writeFileSync(path.join(dir, "Mother.json"), minimalV2CardJson("Mother"));
    fs.writeFileSync(path.join(dir, "note.txt"), "not a character");
    const badPng = path.join(dir, "broken.png");
    fs.writeFileSync(badPng, buildMinimalPng()); // valid PNG, but no embedded card
    mockOpenDialog.mockResolvedValueOnce(dir);

    const result = await openFolderAsTabs();

    expect(result.opened).toBe(2);
    expect(result.failed).toEqual(["broken.png"]);

    const names = useCardStore
      .getState()
      .characters.map((c) => c.card.name)
      .sort();
    expect(names).toEqual(["Father", "Mother"]);
  });

  it("does nothing if the folder dialog is cancelled", async () => {
    mockOpenDialog.mockResolvedValueOnce(null);

    const result = await openFolderAsTabs();

    expect(result).toEqual({ opened: 0, failed: [] });
    expect(useCardStore.getState().characters).toHaveLength(0);
  });
});

describe("saveGroupToFolder", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-test-"));
    resetToNoCardsOpen();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves every not-yet-saved open tab into the folder as .json, deduping name collisions", async () => {
    useCardStore.getState().newCard();
    useCardStore.getState().updateCard({ name: "Child" });
    useCardStore.getState().newCard();
    useCardStore.getState().updateCard({ name: "Child" }); // same name as the first, on purpose

    const result = await saveGroupToFolder(dir);

    expect(result).toEqual({ saved: 2, skippedEmpty: 0, failed: [] });
    expect(fs.existsSync(path.join(dir, "Child.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "Child-2.json"))).toBe(true);
    expect(useCardStore.getState().characters.some((c) => c.isDirty)).toBe(false);
  });

  it("skips a tab whose name is still blank instead of saving it as a nameless file", async () => {
    useCardStore.getState().newCard();
    useCardStore.getState().updateCard({ name: "Father" });
    useCardStore.getState().newCard(); // left blank, e.g. an accidental "+" click

    const result = await saveGroupToFolder(dir);

    expect(result).toEqual({ saved: 1, skippedEmpty: 1, failed: [] });
    expect(fs.existsSync(path.join(dir, "Father.json"))).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(["Father.json"]);
  });

  it("saves an already-placed card back to its own existing path instead of into the folder", async () => {
    const existingDir = fs.mkdtempSync(path.join(os.tmpdir(), "st-card-editor-existing-"));
    const existingPath = path.join(existingDir, "Father.json");
    setSingleActiveCard({
      card: { ...createBlankCard(), name: "Father" },
      currentFilePath: existingPath,
      currentFileFormat: "json",
      isDirty: true,
    });

    const result = await saveGroupToFolder(dir);

    expect(result).toEqual({ saved: 1, skippedEmpty: 0, failed: [] });
    expect(fs.existsSync(existingPath)).toBe(true);
    expect(fs.existsSync(path.join(dir, "Father.json"))).toBe(false);
    fs.rmSync(existingDir, { recursive: true, force: true });
  });
});
