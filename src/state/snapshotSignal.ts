import { create } from "zustand";

/** Counts up whenever a snapshot file is written or deleted, so open snapshot lists reload — a card
 * opened from SillyTavern stays unsaved, so "the card was saved" is no signal there. */
export const useSnapshotSignal = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
