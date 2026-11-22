import { create } from "zustand";

/** "Save to Library" for the open card or all open cards (as a group), opened from the menus. */
export const useLibrarySaveStore = create<{ request: "card" | "group" | null; open: (r: "card" | "group") => void; close: () => void }>(
  (set) => ({
    request: null,
    open: (request) => set({ request }),
    close: () => set({ request: null }),
  }),
);
