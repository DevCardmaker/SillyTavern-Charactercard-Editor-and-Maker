import { create } from "zustand";
import {
  EMPTY_ST_CONFIG,
  loadStConfig,
  saveStConfig,
  stListCharacters,
  stListGroups,
  stListPersonas,
  stThumbnail,
  type StConfig,
} from "../io/sillyTavernClient";
import type { StCharacter, StGroup, StPersona } from "../schema/sillyTavern";

interface SillyTavernState {
  config: StConfig | null;
  ensureConfig: () => Promise<StConfig>;
  saveConfig: (config: StConfig) => Promise<void>;

  characters: StCharacter[] | null;
  groups: StGroup[] | null;
  personas: StPersona[] | null;
  loading: boolean;
  error: string | null;
  /** Reloads all three lists from SillyTavern. */
  refresh: () => Promise<void>;

  /** Object URLs of preview pictures, by "avatar:<file>" / "persona:<file>". */
  thumbnails: Record<string, string>;
  loadThumbnail: (type: "avatar" | "persona", file: string) => Promise<void>;

  /** Which SillyTavern file an open card or persona came from (or was last sent to), by editor tab
   * id — so sending it back overwrites the right one. Kept while the program runs. */
  cardLinks: Record<string, string>;
  personaLinks: Record<string, string>;
  linkCard: (slotId: string, avatar: string) => void;
  linkPersona: (slotId: string, avatar: string) => void;
}

let configOnce: Promise<StConfig> | null = null;
const pendingThumbnails = new Set<string>();

export const useSillyTavernStore = create<SillyTavernState>((set, get) => ({
  config: null,
  ensureConfig: async () => {
    const current = get().config;
    if (current) return current;
    configOnce ??= loadStConfig().then((config) => {
      set({ config });
      return config;
    });
    return configOnce;
  },
  saveConfig: async (config) => {
    set({ config, characters: null, groups: null, personas: null, error: null });
    await saveStConfig(config);
  },

  characters: null,
  groups: null,
  personas: null,
  loading: false,
  error: null,
  refresh: async () => {
    const config = await get().ensureConfig();
    if (!config.baseUrl.trim()) {
      set({ error: "No SillyTavern address set yet — enter it under Settings → SillyTavern.", characters: null, groups: null, personas: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      // One after another: SillyTavern on a small machine answers faster that way than to three at once.
      const characters = await stListCharacters(config);
      const groups = await stListGroups(config);
      const personas = await stListPersonas(config);
      set({ characters, groups, personas });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ loading: false });
    }
  },

  thumbnails: {},
  loadThumbnail: async (type, file) => {
    const key = `${type}:${file}`;
    if (get().thumbnails[key] || pendingThumbnails.has(key)) return;
    pendingThumbnails.add(key);
    try {
      const bytes = await stThumbnail(get().config ?? EMPTY_ST_CONFIG, type, file);
      if (bytes) set((s) => ({ thumbnails: { ...s.thumbnails, [key]: URL.createObjectURL(new Blob([bytes])) } }));
    } finally {
      pendingThumbnails.delete(key);
    }
  },

  cardLinks: {},
  personaLinks: {},
  linkCard: (slotId, avatar) => set((s) => ({ cardLinks: { ...s.cardLinks, [slotId]: avatar } })),
  linkPersona: (slotId, avatar) => set((s) => ({ personaLinks: { ...s.personaLinks, [slotId]: avatar } })),
}));
