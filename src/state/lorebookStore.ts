import { create } from "zustand";
import type { Lorebook } from "../schema/lorebook";

/** One open standalone lorebook (World Info file) in the Lorebooks workspace — the counterpart
 * of cardStore's `CharacterSlot`, minus avatar/format handling: standalone lorebooks are always
 * JSON and always saved in SillyTavern's World Info format (see `toWorldInfo`). */
export interface LorebookSlot {
  id: string;
  book: Lorebook;
  currentFilePath: string | null;
  isDirty: boolean;
}

interface LorebookState {
  lorebooks: LorebookSlot[];
  activeId: string | null;

  /** Opens a new empty lorebook as a new tab and activates it. */
  newLorebook: () => void;
  /** Opens a loaded lorebook as a new tab and activates it — never replaces an existing tab. */
  loadLorebook: (book: Lorebook, path: string) => void;
  /** Replaces the active lorebook wholesale; marks it dirty. */
  updateActive: (book: Lorebook) => void;
  /** By id rather than "the active one": the save dialog is async, the user may switch tabs. */
  markSaved: (id: string, path: string) => void;
  setActive: (id: string) => void;
  /** Closes a tab outright. Caller is responsible for any unsaved-changes confirmation first. */
  close: (id: string) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function emptyLorebook(): Lorebook {
  return { name: "", description: "", entries: [], extensions: {} };
}

export const useLorebookStore = create<LorebookState>((set) => ({
  lorebooks: [],
  activeId: null,

  newLorebook: () => {
    const slot: LorebookSlot = { id: newId(), book: emptyLorebook(), currentFilePath: null, isDirty: false };
    set((s) => ({ lorebooks: [...s.lorebooks, slot], activeId: slot.id }));
  },

  loadLorebook: (book, path) => {
    const slot: LorebookSlot = { id: newId(), book, currentFilePath: path, isDirty: false };
    set((s) => ({ lorebooks: [...s.lorebooks, slot], activeId: slot.id }));
  },

  updateActive: (book) =>
    set((s) => ({
      lorebooks: s.lorebooks.map((l) => (l.id === s.activeId ? { ...l, book, isDirty: true } : l)),
    })),

  markSaved: (id, path) =>
    set((s) => ({
      lorebooks: s.lorebooks.map((l) => (l.id === id ? { ...l, currentFilePath: path, isDirty: false } : l)),
    })),

  setActive: (id) => set({ activeId: id }),

  close: (id) =>
    set((s) => {
      const index = s.lorebooks.findIndex((l) => l.id === id);
      const lorebooks = s.lorebooks.filter((l) => l.id !== id);
      if (s.activeId !== id) return { lorebooks };
      // Same neighbour-selection as closing a character tab: the one to the right, else the left.
      const next = lorebooks[index] ?? lorebooks[index - 1] ?? null;
      return { lorebooks, activeId: next?.id ?? null };
    }),
}));
