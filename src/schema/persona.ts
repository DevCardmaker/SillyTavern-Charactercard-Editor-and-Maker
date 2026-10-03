import { createBlankCard, type NormalizedCard } from "./normalize";

/** Marks a card file as a persona made in this editor. SillyTavern has no persona file format —
 * personas live in its settings, keyed by an avatar image — but it can turn any character card
 * into a persona ("Convert to Persona", which takes over name, description and avatar). So a
 * persona here is a slim card with only those fields filled in, and this flag lets the editor
 * reopen it in the Personas mode. */
export const PERSONA_MARKER = "st_card_editor_persona";

export function isPersona(card: NormalizedCard): boolean {
  return card.extensions?.[PERSONA_MARKER] === true;
}

/** Returns the card flagged as a persona (unchanged if it already is one) — for cards opened in
 * the Personas mode, so saving them keeps them recognisable as personas. */
export function asPersona(card: NormalizedCard): NormalizedCard {
  return isPersona(card) ? card : { ...card, extensions: { ...card.extensions, [PERSONA_MARKER]: true } };
}

export function createBlankPersona(): NormalizedCard {
  return asPersona(createBlankCard());
}

/** On "Convert to Persona", SillyTavern offers to swap {{char}} and {{user}} — what's right
 * depends on which button gets clicked there, so the persona's own name is the safe choice. */
export function personaMacroWarning(description: string): string | undefined {
  return /\{\{(char|user)\}\}/i.test(description)
    ? "Contains {{char}}/{{user}} — SillyTavern offers to swap these on “Convert to Persona”. Writing the persona's name instead avoids surprises."
    : undefined;
}
