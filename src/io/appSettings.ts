import { appConfigDir, appDataDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

/** App-wide settings that don't belong to one feature's own file. */
export interface AppSettings {
  /** Folder of the card library; "" = the default in the app's data folder. */
  libraryDir: string;
  /** Proxy for the editor's own internet requests (cloud AI, direct downloads); "" = none. */
  proxy: string;
  /** Colour dialogue, actions and macros in the card text fields. */
  highlight: boolean;
}

const FILE = "app-settings.json";
export const DEFAULT_APP_SETTINGS: AppSettings = { libraryDir: "", proxy: "", highlight: true };

async function filePath(): Promise<string> {
  return join(await appConfigDir(), FILE);
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBinary(await filePath())));
    return {
      libraryDir: typeof parsed.libraryDir === "string" ? parsed.libraryDir : "",
      proxy: typeof parsed.proxy === "string" ? parsed.proxy : "",
      highlight: parsed.highlight !== false,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await writeBinary(await filePath(), new TextEncoder().encode(JSON.stringify(settings, null, 2)));
}

export async function defaultLibraryDir(): Promise<string> {
  return join(await appDataDir(), "Library");
}
