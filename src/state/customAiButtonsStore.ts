import { create } from "zustand";
import { loadCustomAiButtons, saveCustomAiButtons, type CustomAiButton } from "../io/customAiButtons";

interface CustomAiButtonsState {
  buttons: CustomAiButton[] | null;
  ensureLoaded: () => Promise<void>;
  save: (buttons: CustomAiButton[]) => Promise<void>;
}

let loadOnce: Promise<void> | null = null;

export const useCustomAiButtonsStore = create<CustomAiButtonsState>((set, get) => ({
  buttons: null,
  ensureLoaded: async () => {
    if (get().buttons) return;
    loadOnce ??= loadCustomAiButtons().then((buttons) => set({ buttons }));
    await loadOnce;
  },
  save: async (buttons) => {
    set({ buttons: await saveCustomAiButtons(buttons) });
  },
}));
