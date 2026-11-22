import { create } from "zustand";

/** The SillyTavern dialogs, opened from the header, the persona toolbar or the SillyTavern page. */
interface StDialogState {
  send: { kind: "card" | "persona"; slotId: string } | null;
  createGroup: boolean;
  openSend: (kind: "card" | "persona", slotId: string) => void;
  openCreateGroup: () => void;
  close: () => void;
}

export const useStDialogStore = create<StDialogState>((set) => ({
  send: null,
  createGroup: false,
  openSend: (kind, slotId) => set({ send: { kind, slotId }, createGroup: false }),
  openCreateGroup: () => set({ createGroup: true, send: null }),
  close: () => set({ send: null, createGroup: false }),
}));
