import { appConfigDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { parsePromptsFile, type PromptKey, serializeDefaultPromptsFile } from "../schema/promptTexts";
import { readBinary, writeBinary } from "./rawFile";

export const PROMPTS_FILENAME = "prompts.txt";

export async function promptsFilePath(): Promise<string> {
  return join(await appConfigDir(), PROMPTS_FILENAME);
}

export interface PromptsFileStatus {
  path: string;
  exists: boolean;
  overridden: PromptKey[];
  unknown: string[];
  overrides: Partial<Record<PromptKey, string>>;
}

/** Reads the prompts file; a missing file simply means "all built-in". */
export async function readPromptsFile(): Promise<PromptsFileStatus> {
  const path = await promptsFilePath();
  let content: string;
  try {
    content = new TextDecoder().decode(await readBinary(path));
  } catch {
    return { path, exists: false, overridden: [], unknown: [], overrides: {} };
  }
  const { overrides, unknown } = parsePromptsFile(content);
  return { path, exists: true, overridden: Object.keys(overrides) as PromptKey[], unknown, overrides };
}

/** Opens the prompts file in the system's default text editor, first writing the built-in
 * prompts into it if it doesn't exist yet. An existing file is never overwritten. */
export async function openPromptsFile(): Promise<void> {
  const status = await readPromptsFile();
  if (!status.exists) await writeBinary(status.path, new TextEncoder().encode(serializeDefaultPromptsFile()));
  await openPath(status.path);
}
