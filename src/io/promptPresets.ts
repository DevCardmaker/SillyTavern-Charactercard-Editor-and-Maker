import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

export type PromptPresetField = "system_prompt" | "post_history_instructions";

export interface PromptPreset {
  id: string;
  label: string;
  text: string;
}

export type PromptPresetsFile = Record<PromptPresetField, PromptPreset[]>;

const PRESETS_FILENAME = "prompt-presets.json";

/** Shipped so the feature isn't an empty dropdown on first use — plain starting points the user
 * is expected to edit/replace/delete freely, not a fixed "correct" set. */
const DEFAULT_PRESETS: PromptPresetsFile = {
  system_prompt: [
    {
      id: "seed-slapstick",
      label: "Slapstick",
      text: "Write responses in an exaggeratedly comedic, slapstick tone with humorous mishaps and situational comedy.",
    },
    {
      id: "seed-serious",
      label: "Serious",
      text: "Write in a serious, reserved tone without humor or irony.",
    },
    {
      id: "seed-third-person",
      label: "Third Person",
      text: "{{char}} consistently speaks and acts in third person (he/she/name instead of I).",
    },
    {
      id: "seed-first-person",
      label: "First Person",
      text: "{{char}} consistently speaks and acts in first person (I-perspective).",
    },
  ],
  post_history_instructions: [],
};

async function presetsFilePath(): Promise<string> {
  return join(await appConfigDir(), PRESETS_FILENAME);
}

/** Loads the saved presets, seeding (and persisting) the defaults on first run when no config
 * file exists yet. A corrupted/unreadable file falls back to the same defaults rather than
 * throwing — presets are a convenience, not something that should block opening the app. */
export async function loadPromptPresets(): Promise<PromptPresetsFile> {
  const path = await presetsFilePath();
  try {
    const bytes = await readBinary(path);
    return JSON.parse(new TextDecoder().decode(bytes)) as PromptPresetsFile;
  } catch {
    await savePromptPresets(DEFAULT_PRESETS, path);
    return DEFAULT_PRESETS;
  }
}

export async function savePromptPresets(data: PromptPresetsFile, path?: string): Promise<void> {
  const target = path ?? (await presetsFilePath());
  await writeBinary(target, new TextEncoder().encode(JSON.stringify(data, null, 2)));
}
