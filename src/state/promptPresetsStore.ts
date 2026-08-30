import { create } from "zustand";
import {
  loadPromptPresets,
  savePromptPresets,
  type PromptPreset,
  type PromptPresetField,
  type PromptPresetsFile,
} from "../io/promptPresets";

interface PromptPresetsState {
  presets: PromptPresetsFile | null;
  ensureLoaded: () => Promise<void>;
  addPreset: (field: PromptPresetField, label: string, text: string) => Promise<void>;
  removePreset: (field: PromptPresetField, id: string) => Promise<void>;
}

let loadOnce: Promise<void> | null = null;

export const usePromptPresetsStore = create<PromptPresetsState>((set, get) => ({
  presets: null,

  ensureLoaded: async () => {
    if (get().presets) return;
    loadOnce ??= loadPromptPresets().then((presets) => set({ presets }));
    await loadOnce;
  },

  addPreset: async (field, label, text) => {
    const current = get().presets;
    if (!current) return;
    const next: PromptPresetsFile = {
      ...current,
      [field]: [...current[field], { id: crypto.randomUUID(), label, text }],
    };
    set({ presets: next });
    await savePromptPresets(next);
  },

  removePreset: async (field, id) => {
    const current = get().presets;
    if (!current) return;
    const next: PromptPresetsFile = {
      ...current,
      [field]: current[field].filter((p: PromptPreset) => p.id !== id),
    };
    set({ presets: next });
    await savePromptPresets(next);
  },
}));
