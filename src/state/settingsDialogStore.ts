import { create } from "zustand";

export type SettingsSection = "ai" | "prompts" | "buttons";

/** The settings window, opened from the header menu or from any panel's "Change…" link. */
interface SettingsDialogState {
  section: SettingsSection | null;
  open: (section: SettingsSection) => void;
  close: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  section: null,
  open: (section) => set({ section }),
  close: () => set({ section: null }),
}));
