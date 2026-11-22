import { create } from "zustand";
import { defaultLibraryDir, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, type AppSettings } from "../io/appSettings";

interface AppSettingsState {
  settings: AppSettings | null;
  ensureLoaded: () => Promise<AppSettings>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

let loadOnce: Promise<AppSettings> | null = null;

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  settings: null,
  ensureLoaded: async () => {
    const current = get().settings;
    if (current) return current;
    loadOnce ??= loadAppSettings().then((settings) => {
      set({ settings });
      return settings;
    });
    return loadOnce;
  },
  update: async (patch) => {
    const next = { ...(get().settings ?? DEFAULT_APP_SETTINGS), ...patch };
    set({ settings: next });
    await saveAppSettings(next);
  },
}));

/** The library folder in use: the chosen one, or the default. */
export async function libraryDirNow(): Promise<string> {
  const settings = await useAppSettingsStore.getState().ensureLoaded();
  return settings.libraryDir.trim() || defaultLibraryDir();
}

export async function proxyNow(): Promise<string | null> {
  const settings = await useAppSettingsStore.getState().ensureLoaded();
  return settings.proxy.trim() || null;
}
