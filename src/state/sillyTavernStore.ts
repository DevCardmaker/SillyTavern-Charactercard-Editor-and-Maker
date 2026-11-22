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
import { loadStLinks, saveStLinks, type StLinks } from "../io/stLinks";
import { useCardStore } from "./cardStore";
import { usePersonaStore } from "./personaStore";

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
  /** The links of saved files, kept between starts (by local file path). */
  savedLinks: StLinks | null;
  /** The SillyTavern file an open card / persona belongs to: from this session, or from its file. */
  linkedCard: (slotId: string) => Promise<string | undefined>;
  linkedPersona: (slotId: string) => Promise<string | undefined>;
}

let linksOnce: Promise<StLinks> | null = null;

async function savedLinks(): Promise<StLinks> {
  const current = useSillyTavernStore.getState().savedLinks;
  if (current) return current;
  linksOnce ??= loadStLinks().then((links) => {
    useSillyTavernStore.setState({ savedLinks: links });
    return links;
  });
  return linksOnce;
}

/** Remembers the link of a slot that has a file, so it survives a restart. */
async function persistLink(kind: "cards" | "personas", path: string | null, avatar: string): Promise<void> {
  if (!path) return;
  const links = await savedLinks();
  if (links[kind][path] === avatar) return;
  const next = { ...links, [kind]: { ...links[kind], [path]: avatar } };
  useSillyTavernStore.setState({ savedLinks: next });
  await saveStLinks(next).catch(() => undefined);
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
  linkCard: (slotId, avatar) => {
    set((s) => ({ cardLinks: { ...s.cardLinks, [slotId]: avatar } }));
    const path = useCardStore.getState().characters.find((c) => c.id === slotId)?.currentFilePath ?? null;
    void persistLink("cards", path, avatar);
  },
  linkPersona: (slotId, avatar) => {
    set((s) => ({ personaLinks: { ...s.personaLinks, [slotId]: avatar } }));
    const path = usePersonaStore.getState().characters.find((c) => c.id === slotId)?.currentFilePath ?? null;
    void persistLink("personas", path, avatar);
  },
  savedLinks: null,
  linkedCard: async (slotId) => {
    const inSession = get().cardLinks[slotId];
    if (inSession) return inSession;
    const path = useCardStore.getState().characters.find((c) => c.id === slotId)?.currentFilePath;
    return path ? (await savedLinks()).cards[path] : undefined;
  },
  linkedPersona: async (slotId) => {
    const inSession = get().personaLinks[slotId];
    if (inSession) return inSession;
    const path = usePersonaStore.getState().characters.find((c) => c.id === slotId)?.currentFilePath;
    return path ? (await savedLinks()).personas[path] : undefined;
  },
}));

// A card opened from SillyTavern has no file yet; once it's saved, its link is remembered too.
for (const [store, kind] of [
  [useCardStore, "cards"],
  [usePersonaStore, "personas"],
] as const) {
  store.subscribe((state, previous) => {
    const links = kind === "cards" ? useSillyTavernStore.getState().cardLinks : useSillyTavernStore.getState().personaLinks;
    for (const slot of state.characters) {
      const before = previous.characters.find((c) => c.id === slot.id);
      if (slot.currentFilePath && slot.currentFilePath !== before?.currentFilePath && links[slot.id]) {
        void persistLink(kind, slot.currentFilePath, links[slot.id]);
      }
    }
  });
}
