import { create } from "zustand";
import { AI_CONTEXT_PARTS, DEFAULT_AI_CONTEXT, type AiContextKey } from "../schema/aiContext";

const STORAGE_KEY = "ai-context-parts";
const PERSONA_KEY = "ai-context-persona";

function loadKeys(): AiContextKey[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed)) {
      const known = new Set(AI_CONTEXT_PARTS.map((p) => p.key));
      return parsed.filter((k): k is AiContextKey => known.has(k));
    }
  } catch {
    // Unreadable: start from the defaults.
  }
  return [...DEFAULT_AI_CONTEXT];
}

interface AiContextState {
  keys: AiContextKey[];
  /** Id of the open persona to include, "" for none. Only meaningful while that persona is open. */
  personaId: string;
  toggle: (key: AiContextKey) => void;
  setPersonaId: (id: string) => void;
  reset: () => void;
}

function save(keys: AiContextKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Only a convenience.
  }
}

/** Which parts the AI sees — one choice for all cards, remembered between starts. */
export const useAiContextStore = create<AiContextState>((set, get) => ({
  keys: loadKeys(),
  personaId: (() => {
    try {
      return localStorage.getItem(PERSONA_KEY) ?? "";
    } catch {
      return "";
    }
  })(),
  toggle: (key) => {
    const keys = get().keys.includes(key) ? get().keys.filter((k) => k !== key) : [...get().keys, key];
    save(keys);
    set({ keys });
  },
  setPersonaId: (personaId) => {
    try {
      localStorage.setItem(PERSONA_KEY, personaId);
    } catch {
      // Only a convenience.
    }
    set({ personaId });
  },
  reset: () => {
    save([...DEFAULT_AI_CONTEXT]);
    set({ keys: [...DEFAULT_AI_CONTEXT] });
  },
}));
