import { getCharacterNote } from "./characterNote";
import type { NormalizedCard } from "./normalize";

/** Prompt-size settings. Defaults are Patrick's SillyTavern (checked in its settings.json):
 * 16k context, 400-token responses, World Info capped at 25% of the context. */
export interface BudgetSettings {
  contextSize: number;
  responseLength: number;
  worldInfoPercent: number;
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  contextSize: 16384,
  responseLength: 400,
  worldInfoPercent: 25,
};

/** Card fields that can be condensed with AI — the ones that sit in the prompt as plain text. */
export type BudgetField = "description" | "personality" | "scenario" | "mes_example" | "first_mes" | "system_prompt" | "post_history_instructions";

export interface BudgetLine {
  label: string;
  tokens: number;
  /** Set for card fields, so the UI can offer "Condense…" right there. */
  field?: BudgetField;
}

export interface ContextBudget {
  /** Sent with every single message. */
  permanent: BudgetLine[];
  /** In the prompt at the start of a chat, pushed out as the history grows (ST's default for example
   * dialogue; the first message is just the opening chat message). */
  early: BudgetLine[];
  permanentTotal: number;
  earlyTotal: number;
  /** Context left for chat history once permanent parts and the response are reserved. */
  chatSpace: number;
  /** Constant (always-on) lorebook entries vs. the World Info cap — over the cap, SillyTavern
   * drops entries. Triggered entries share the same cap. */
  constantLoreTokens: number;
  worldInfoCap: number;
  triggeredLoreEntries: number;
  largestTriggeredLore: number;
}

/** Breaks a card's prompt footprint down the way SillyTavern assembles it (with "prefer the
 * character's system prompt / post-history instructions" on, as in Patrick's ST). Ignores the
 * instruct template's own few dozen tokens. `count` is the token counter to use. */
export function contextBudget(
  card: NormalizedCard,
  count: (text: string) => number,
  settings: BudgetSettings = DEFAULT_BUDGET_SETTINGS,
  personaDescription = "",
): ContextBudget {
  const line = (label: string, text: string, field?: BudgetField): BudgetLine => ({ label, tokens: count(text), field });

  const entries = (card.character_book?.entries ?? []).filter((e) => e.enabled);
  const constantLoreTokens = entries.filter((e) => e.constant).reduce((sum, e) => sum + count(e.content), 0);
  const triggered = entries.filter((e) => !e.constant).map((e) => count(e.content));

  const permanent = [
    line("System prompt", card.system_prompt, "system_prompt"),
    line("Description", card.description, "description"),
    line("Personality", card.personality, "personality"),
    line("Scenario", card.scenario, "scenario"),
    line("Post-history instructions", card.post_history_instructions, "post_history_instructions"),
    line("Character's note", getCharacterNote(card).prompt),
    line("Persona", personaDescription),
    { label: "Always-active lorebook entries", tokens: constantLoreTokens },
  ].filter((l) => l.tokens > 0);

  const early = [line("Example dialogue", card.mes_example, "mes_example"), line("First message", card.first_mes, "first_mes")].filter(
    (l) => l.tokens > 0,
  );

  const permanentTotal = permanent.reduce((sum, l) => sum + l.tokens, 0);
  return {
    permanent,
    early,
    permanentTotal,
    earlyTotal: early.reduce((sum, l) => sum + l.tokens, 0),
    chatSpace: Math.max(0, settings.contextSize - settings.responseLength - permanentTotal),
    constantLoreTokens,
    worldInfoCap: Math.floor((settings.contextSize * settings.worldInfoPercent) / 100),
    triggeredLoreEntries: triggered.length,
    largestTriggeredLore: Math.max(0, ...triggered),
  };
}
