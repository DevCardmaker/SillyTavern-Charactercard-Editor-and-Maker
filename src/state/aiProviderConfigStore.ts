import { create } from "zustand";
import {
  type AiProviderConfig,
  type AiProviderConfigFile,
  type AiProviderProfile,
  loadAiProviderConfig,
  saveAiProviderConfig,
} from "../io/aiProviderConfig";

interface AiProviderConfigState {
  file: AiProviderConfigFile | null;
  ensureLoaded: () => Promise<void>;
  setActiveProfile: (id: string | null) => Promise<void>;
  addProfile: (label: string, profile: AiProviderConfig) => Promise<void>;
  updateProfile: (id: string, patch: Partial<AiProviderConfig>) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

let loadOnce: Promise<void> | null = null;

export const useAiProviderConfigStore = create<AiProviderConfigState>((set, get) => ({
  file: null,

  ensureLoaded: async () => {
    if (get().file) return;
    loadOnce ??= loadAiProviderConfig().then((file) => set({ file }));
    await loadOnce;
  },

  setActiveProfile: async (id) => {
    const current = get().file;
    if (!current) return;
    const next: AiProviderConfigFile = { ...current, activeProfileId: id };
    set({ file: next });
    await saveAiProviderConfig(next);
  },

  addProfile: async (label, profile) => {
    const current = get().file;
    if (!current) return;
    const newProfile: AiProviderProfile = { id: crypto.randomUUID(), label, ...profile };
    const next: AiProviderConfigFile = {
      profiles: [...current.profiles, newProfile],
      activeProfileId: newProfile.id,
    };
    set({ file: next });
    await saveAiProviderConfig(next);
  },

  updateProfile: async (id, patch) => {
    const current = get().file;
    if (!current) return;
    const next: AiProviderConfigFile = {
      ...current,
      profiles: current.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    };
    set({ file: next });
    await saveAiProviderConfig(next);
  },

  removeProfile: async (id) => {
    const current = get().file;
    if (!current) return;
    const profiles = current.profiles.filter((p) => p.id !== id);
    const activeProfileId = current.activeProfileId === id ? (profiles[0]?.id ?? null) : current.activeProfileId;
    const next: AiProviderConfigFile = { profiles, activeProfileId };
    set({ file: next });
    await saveAiProviderConfig(next);
  },
}));
