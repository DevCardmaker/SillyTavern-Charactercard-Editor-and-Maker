import { create } from "zustand";
import type { AiChatMessage } from "../schema/aiPrompt";
import { setPromptOverrides } from "../schema/promptTexts";
import { type PromptsFileStatus, readPromptsFile } from "../io/promptFile";

interface PromptFileState {
  status: PromptsFileStatus | null;
  error: string | null;
  /** What the last AI request actually sent — for "Show last prompt". */
  lastMessages: AiChatMessage[] | null;
  reload: () => Promise<void>;
  setLastMessages: (messages: AiChatMessage[]) => void;
}

/** The user's prompts file (see promptTexts.ts): loaded once at startup and on "Reload prompts";
 * its sections replace the built-in ones from then on. */
export const usePromptFileStore = create<PromptFileState>((set) => ({
  status: null,
  error: null,
  lastMessages: null,

  reload: async () => {
    try {
      const status = await readPromptsFile();
      setPromptOverrides(status.overrides);
      set({ status, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  setLastMessages: (messages) => set({ lastMessages: messages }),
}));
