import { create } from "zustand";
import { loadRecentCards, recordRecentCard, removeRecentCards } from "../io/recentCards";

interface RecentCardsState {
  recent: string[] | null;
  ensureLoaded: () => Promise<void>;
  recordOpened: (path: string) => Promise<void>;
  removeStale: (paths: string[]) => Promise<void>;
}

let loadOnce: Promise<void> | null = null;

export const useRecentCardsStore = create<RecentCardsState>((set, get) => ({
  recent: null,

  ensureLoaded: async () => {
    if (get().recent) return;
    loadOnce ??= loadRecentCards().then((recent) => set({ recent }));
    await loadOnce;
  },

  recordOpened: async (path) => {
    const recent = await recordRecentCard(path);
    set({ recent });
  },

  removeStale: async (paths) => {
    const recent = await removeRecentCards(paths);
    set({ recent });
  },
}));
