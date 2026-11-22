import { create } from "zustand";
import { loadRecentCards, recordRecentCard, removeRecentCards } from "../io/recentCards";
import { loadRecentGroups, recordRecentGroup, removeRecentGroup, type RecentGroup } from "../io/recentGroups";

interface RecentCardsState {
  recent: string[] | null;
  ensureLoaded: () => Promise<void>;
  recordOpened: (path: string) => Promise<void>;
  removeStale: (paths: string[]) => Promise<void>;
  groups: RecentGroup[] | null;
  ensureGroupsLoaded: () => Promise<void>;
  recordGroup: (paths: string[]) => Promise<void>;
  removeGroup: (paths: string[]) => Promise<void>;
}

let loadOnce: Promise<void> | null = null;
let loadGroupsOnce: Promise<void> | null = null;

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

  groups: null,

  ensureGroupsLoaded: async () => {
    if (get().groups) return;
    loadGroupsOnce ??= loadRecentGroups().then((groups) => set({ groups }));
    await loadGroupsOnce;
  },

  recordGroup: async (paths) => {
    const groups = await recordRecentGroup(paths);
    set({ groups });
  },

  removeGroup: async (paths) => {
    const groups = await removeRecentGroup(paths);
    set({ groups });
  },
}));
