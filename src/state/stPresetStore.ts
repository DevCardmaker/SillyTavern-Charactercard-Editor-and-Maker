import { create } from "zustand";
import type { StPreset } from "../schema/stPreset";

/** One open preset. There's no "new" here: a preset without SillyTavern's own prompts and settings
 * is of little use, so editing always starts from an existing file. */
export interface StPresetSlot {
  id: string;
  preset: StPreset;
  path: string;
  isDirty: boolean;
  /** The file's text when last read or written, to notice SillyTavern changing it in the meantime. */
  diskText: string;
}

interface StPresetState {
  presets: StPresetSlot[];
  activeId: string | null;
  /** Opens a preset as a new tab — or just switches to it if that file is already open. */
  loadPreset: (preset: StPreset, path: string, diskText: string) => void;
  updateActive: (preset: StPreset) => void;
  /** By id rather than "the active one": the save dialog is async, the user may switch tabs. */
  markSaved: (id: string, path: string, diskText: string) => void;
  setActive: (id: string) => void;
  /** Caller is responsible for any unsaved-changes confirmation first. */
  close: (id: string) => void;
}

export const useStPresetStore = create<StPresetState>((set) => ({
  presets: [],
  activeId: null,

  loadPreset: (preset, path, diskText) =>
    set((s) => {
      const open = s.presets.find((p) => p.path === path);
      if (open) return { activeId: open.id };
      const slot: StPresetSlot = { id: crypto.randomUUID(), preset, path, isDirty: false, diskText };
      return { presets: [...s.presets, slot], activeId: slot.id };
    }),

  updateActive: (preset) =>
    set((s) => ({ presets: s.presets.map((p) => (p.id === s.activeId ? { ...p, preset, isDirty: true } : p)) })),

  markSaved: (id, path, diskText) =>
    set((s) => ({ presets: s.presets.map((p) => (p.id === id ? { ...p, path, diskText, isDirty: false } : p)) })),

  setActive: (id) => set({ activeId: id }),

  close: (id) =>
    set((s) => {
      const index = s.presets.findIndex((p) => p.id === id);
      const presets = s.presets.filter((p) => p.id !== id);
      if (s.activeId !== id) return { presets };
      const next = presets[index] ?? presets[index - 1] ?? null;
      return { presets, activeId: next?.id ?? null };
    }),
}));
