import type { NormalizedCard } from "./normalize";

/** Parts of a card (and the persona) the AI may see as background for quick actions and the
 * brainstorm chat. Fewer parts leave more room in a small context and keep a small model on topic. */
export type AiContextKey =
  | "name"
  | "description"
  | "personality"
  | "scenario"
  | "first_mes"
  | "mes_example"
  | "alternate_greetings"
  | "system_prompt"
  | "creator_notes"
  | "lorebook"
  | "persona";

export const AI_CONTEXT_PARTS: { key: AiContextKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "personality", label: "Personality" },
  { key: "scenario", label: "Scenario" },
  { key: "first_mes", label: "First message" },
  { key: "mes_example", label: "Example dialogue" },
  { key: "alternate_greetings", label: "Alternate greetings" },
  { key: "system_prompt", label: "System prompt" },
  { key: "creator_notes", label: "Creator notes" },
  { key: "lorebook", label: "Lorebook" },
  { key: "persona", label: "Your persona" },
];

export const DEFAULT_AI_CONTEXT: AiContextKey[] = ["name", "description", "personality", "scenario"];

export interface PersonaForContext {
  name: string;
  description: string;
}

/** One part as text, or "" if the card has nothing there. */
export function contextPartText(card: NormalizedCard, key: AiContextKey, persona: PersonaForContext | null): string {
  switch (key) {
    case "name":
      return card.name.trim();
    case "alternate_greetings":
      return card.alternate_greetings
        .filter((g) => g.trim())
        .map((g, i) => `(${i + 1}) ${g.trim()}`)
        .join("\n\n");
    case "lorebook":
      return (card.character_book?.entries ?? [])
        .filter((e) => e.enabled !== false && e.content.trim())
        .map((e) => `- ${e.comment?.trim() || e.keys.join(", ")}: ${e.content.trim()}`)
        .join("\n");
    case "persona":
      return persona && (persona.name.trim() || persona.description.trim())
        ? `${persona.name.trim() || "{{user}}"} ({{user}}): ${persona.description.trim()}`
        : "";
    default:
      return String(card[key] ?? "").trim();
  }
}

/** The chosen parts as labelled sections. `skip` leaves out the field being edited — it's in the
 * request anyway. */
export function buildAiContext(
  card: NormalizedCard,
  keys: readonly AiContextKey[],
  persona: PersonaForContext | null,
  skip?: AiContextKey,
): string {
  return AI_CONTEXT_PARTS.filter((part) => keys.includes(part.key) && part.key !== skip)
    .map((part) => {
      const text = contextPartText(card, part.key, persona);
      return text ? `## ${part.label}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
