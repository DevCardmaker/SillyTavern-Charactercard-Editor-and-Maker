import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";
import type { AiProviderConfig } from "./aiClient";

export type { AiProviderConfig };

export interface AiProviderProfile extends AiProviderConfig {
  id: string;
  label: string;
}

export interface AiProviderConfigFile {
  profiles: AiProviderProfile[];
  activeProfileId: string | null;
}

const CONFIG_FILENAME = "ai-provider-config.json";

const DEFAULT_CONFIG: AiProviderConfigFile = { profiles: [], activeProfileId: null };

async function configFilePath(): Promise<string> {
  return join(await appConfigDir(), CONFIG_FILENAME);
}

/** Earlier versions of this file stored a single `{ baseUrl, apiKey, model }` object instead of
 * a list of named profiles. Wraps that shape into a single migrated profile on first load so an
 * already-configured connection isn't silently lost when this file is read next. */
function migrateLegacyShape(raw: unknown): AiProviderConfigFile | null {
  if (!raw || typeof raw !== "object" || "profiles" in raw) return null;
  const legacy = raw as Partial<AiProviderConfig>;
  if (typeof legacy.baseUrl !== "string") return null;
  const id = crypto.randomUUID();
  return {
    profiles: [{ id, label: "Migrated", baseUrl: legacy.baseUrl, apiKey: legacy.apiKey ?? "", model: legacy.model ?? "" }],
    activeProfileId: id,
  };
}

/** Loads the saved AI provider profiles, seeding (and persisting) an empty list on first run.
 * A corrupted/unreadable file falls back to the same defaults rather than throwing — this is a
 * convenience setting, not something that should block opening the app. */
export async function loadAiProviderConfig(): Promise<AiProviderConfigFile> {
  const path = await configFilePath();
  try {
    const bytes = await readBinary(path);
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    const migrated = migrateLegacyShape(raw);
    if (migrated) {
      await saveAiProviderConfig(migrated, path);
      return migrated;
    }
    return raw as AiProviderConfigFile;
  } catch {
    await saveAiProviderConfig(DEFAULT_CONFIG, path);
    return DEFAULT_CONFIG;
  }
}

export async function saveAiProviderConfig(config: AiProviderConfigFile, path?: string): Promise<void> {
  const target = path ?? (await configFilePath());
  await writeBinary(target, new TextEncoder().encode(JSON.stringify(config, null, 2)));
}
