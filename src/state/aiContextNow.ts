import { buildAiContext, type AiContextKey } from "../schema/aiContext";
import { useAiContextStore } from "./aiContextStore";
import { useCardStore } from "./cardStore";
import { usePersonaStore } from "./personaStore";

/** The AI Context of the open card as it is at this moment — read when a request is sent, so the
 * AI always works with the current text, unsaved edits included. */
export function aiContextNow(skip?: AiContextKey): string {
  const card = useCardStore.getState().card;
  if (!card) return "";
  const { keys, personaId } = useAiContextStore.getState();
  const persona = usePersonaStore.getState().characters.find((p) => p.id === personaId)?.card ?? null;
  return buildAiContext(card, keys, persona ? { name: persona.name, description: persona.description } : null, skip);
}
