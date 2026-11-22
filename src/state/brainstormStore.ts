import { create } from "zustand";
import type { AiChatMessage } from "../schema/aiPrompt";

/** Brainstorm chats per open card, for as long as the program runs. Never saved: it's for thinking
 * things through, not part of the card. */
interface BrainstormState {
  chats: Record<string, AiChatMessage[]>;
  setChat: (cardId: string, messages: AiChatMessage[]) => void;
}

export const useBrainstormStore = create<BrainstormState>((set) => ({
  chats: {},
  setChat: (cardId, messages) => set((s) => ({ chats: { ...s.chats, [cardId]: messages } })),
}));
