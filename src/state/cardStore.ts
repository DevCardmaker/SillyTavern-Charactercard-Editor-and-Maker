import { create } from "zustand";
import { clearAutosave, writeAutosave } from "../io/autosave";
import { createBlankCard, type NormalizedCard } from "../schema/normalize";

export type FileFormat = "png" | "json";

interface CharacterSlot {
  id: string;
  card: NormalizedCard;
  avatarPng: Uint8Array | null;
  currentFilePath: string | null;
  currentFileFormat: FileFormat | null;
  isDirty: boolean;
}

/** The fields every consumer already reads today (Toolbar, AvatarPanel, the tab components via
 * App.tsx, ...) — always a mirror of `characters.find(c => c.id === activeId)`, recomputed by
 * every action below in the same `set()` call that touches `characters`/`activeId`. This is the
 * only thing that lets those consumers keep reading `useCardStore((s) => s.card)` etc. completely
 * unchanged after the move to multiple simultaneously open characters. */
interface ActiveMirror {
  card: NormalizedCard | null;
  avatarPng: Uint8Array | null;
  currentFilePath: string | null;
  currentFileFormat: FileFormat | null;
  isDirty: boolean;
}

interface CardState extends ActiveMirror {
  characters: CharacterSlot[];
  activeId: string | null;
  /** Shared default save-as directory for a session's still-unsaved cards, set via "Choose Group
   * Folder…" once ≥ 2 tabs are open. See fileIO.ts's use in saveCard/saveCardAsCopy. */
  groupFolder: string | null;

  /** Opens a new blank card as a new tab and activates it — never replaces an existing tab. */
  newCard: () => void;
  /** Opens a loaded card as a new tab and activates it — never replaces an existing tab. */
  loadCard: (card: NormalizedCard, avatarPng: Uint8Array | null, path: string, format: FileFormat) => void;
  updateCard: (patch: Partial<NormalizedCard>) => void;
  setAvatarPng: (bytes: Uint8Array) => void;
  /** Marks the *active* slot as saved — a thin wrapper over `markSlotSaved` for the common case. */
  markSaved: (path: string, format: FileFormat) => void;
  /** Marks an arbitrary slot as saved, active or not — needed for bulk operations like saving
   * every open tab at once, which mostly touch slots other than whichever one happens to be
   * active. `markSaved` above is just this applied to the current `activeId`. */
  markSlotSaved: (id: string, path: string, format: FileFormat) => void;
  /** Switches the active tab. Best-effort autosaves the outgoing tab's card as a JSON snapshot
   * (see io/autosave.ts) — a safety net while juggling several open characters, not a real save. */
  setActiveCharacter: (id: string) => void;
  /** Closes a tab outright. Caller is responsible for any unsaved-changes confirmation first. */
  closeCharacter: (id: string) => void;
  setGroupFolder: (path: string | null) => void;
}

function mirrorOf(characters: CharacterSlot[], activeId: string | null): ActiveMirror {
  const slot = characters.find((c) => c.id === activeId);
  if (!slot) return { card: null, avatarPng: null, currentFilePath: null, currentFileFormat: null, isDirty: false };
  const { card, avatarPng, currentFilePath, currentFileFormat, isDirty } = slot;
  return { card, avatarPng, currentFilePath, currentFileFormat, isDirty };
}

/** Best-effort autosave of whichever slot is being left — shared by every action that switches
 * `activeId` away from a slot (setActiveCharacter, and newCard/loadCard adding a fresh tab on top
 * of one that was already active). */
function autosaveOutgoing(characters: CharacterSlot[], outgoingId: string | null): void {
  const outgoing = characters.find((c) => c.id === outgoingId);
  if (outgoing) void writeAutosave(outgoing.id, outgoing.card);
}

export const useCardStore = create<CardState>((set, get) => ({
  characters: [],
  activeId: null,
  groupFolder: null,
  card: null,
  avatarPng: null,
  currentFilePath: null,
  currentFileFormat: null,
  isDirty: false,

  newCard: () => {
    const { characters: previous, activeId: outgoingId } = get();
    const id = crypto.randomUUID();
    const characters = [
      ...previous,
      { id, card: createBlankCard(), avatarPng: null, currentFilePath: null, currentFileFormat: null, isDirty: false },
    ];
    set({ characters, activeId: id, ...mirrorOf(characters, id) });
    autosaveOutgoing(previous, outgoingId);
  },

  loadCard: (card, avatarPng, path, format) => {
    const { characters: previous, activeId: outgoingId } = get();
    const id = crypto.randomUUID();
    const characters = [
      ...previous,
      { id, card, avatarPng, currentFilePath: path, currentFileFormat: format, isDirty: false },
    ];
    set({ characters, activeId: id, ...mirrorOf(characters, id) });
    autosaveOutgoing(previous, outgoingId);
  },

  updateCard: (patch) => {
    const { characters, activeId } = get();
    if (!activeId) return;
    const next = characters.map((c) => (c.id === activeId ? { ...c, card: { ...c.card, ...patch }, isDirty: true } : c));
    set({ characters: next, ...mirrorOf(next, activeId) });
  },

  setAvatarPng: (bytes) => {
    const { characters, activeId } = get();
    if (!activeId) return;
    const next = characters.map((c) => (c.id === activeId ? { ...c, avatarPng: bytes, isDirty: true } : c));
    set({ characters: next, ...mirrorOf(next, activeId) });
  },

  markSaved: (path, format) => {
    const { activeId } = get();
    if (!activeId) return;
    get().markSlotSaved(activeId, path, format);
  },

  markSlotSaved: (id, path, format) => {
    const { characters, activeId } = get();
    const next = characters.map((c) =>
      c.id === id ? { ...c, currentFilePath: path, currentFileFormat: format, isDirty: false } : c,
    );
    set({ characters: next, ...mirrorOf(next, activeId) });
  },

  setActiveCharacter: (id) => {
    const { characters, activeId: outgoingId } = get();
    if (id === outgoingId) return;
    set({ activeId: id, ...mirrorOf(characters, id) });
    autosaveOutgoing(characters, outgoingId);
  },

  closeCharacter: (id) => {
    const { characters, activeId } = get();
    const next = characters.filter((c) => c.id !== id);
    const nextActiveId = activeId === id ? (next[0]?.id ?? null) : activeId;
    set({ characters: next, activeId: nextActiveId, ...mirrorOf(next, nextActiveId) });
    void clearAutosave(id);
  },

  setGroupFolder: (path) => set({ groupFolder: path }),
}));
