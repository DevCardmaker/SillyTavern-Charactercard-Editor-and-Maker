import { cardV2Schema, type CardV2 } from "./cardV2";
import { cardV3Schema, type CardV3, type CardV3Data } from "./cardV3";
import type { LegacyV1Card } from "./legacyV1";

export type SourceSpec = "v1" | "v2" | "v3";

/** The single shape the editor UI works with, regardless of which spec a card was loaded from.
 * It's V3 data's superset (V3 is a strict superset of V2) plus `sourceSpec`, which remembers
 * the format the card came in so "Speichern" can write back to the same spec by default.
 * `character_book` is narrowed to drop `null` — the schemas accept it (SillyTavern writes an
 * explicit null for "no lorebook"), but the UI only needs to distinguish "present" vs "absent".
 *
 * Built as an intersection (`&`), not `Omit`/`Pick`: CardV3Data carries a Zod `.passthrough()`
 * index signature (`[key: string]: unknown`), and TS's `keyof` over a type with an index
 * signature collapses to `string` — which makes `Omit`/`Pick` resolve every field through the
 * index signature instead of its real type, silently widening the whole shape to `unknown`. */
export type NormalizedCard = CardV3Data & {
  character_book?: CardV3Data["character_book"];
  sourceSpec: SourceSpec;
};

const V3_ONLY_KEYS = [
  "creator_notes_multilingual",
  "source",
  "group_only_greetings",
  "creation_date",
  "modification_date",
  "nickname",
  "assets",
] as const;

export function normalizeFromV2(card: CardV2): NormalizedCard {
  return {
    ...card.data,
    character_book: card.data.character_book ?? undefined,
    group_only_greetings: [],
    sourceSpec: "v2",
  };
}

export function normalizeFromV3(card: CardV3): NormalizedCard {
  return { ...card.data, character_book: card.data.character_book ?? undefined, sourceSpec: "v3" };
}

export function normalizeFromLegacyV1(card: LegacyV1Card): NormalizedCard {
  return {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.first_mes,
    mes_example: card.mes_example,
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
    tags: [],
    creator: "",
    character_version: "",
    extensions: {},
    group_only_greetings: [],
    sourceSpec: "v1",
  };
}

/** A blank starting point for "New card". Defaults to V3 (the current spec) since that's what
 * a freshly created card should target unless the user loads/downgrades an older one. */
export function createBlankCard(): NormalizedCard {
  return {
    name: "",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "",
    mes_example: "",
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
    character_book: undefined,
    tags: [],
    creator: "",
    character_version: "",
    extensions: {},
    group_only_greetings: [],
    sourceSpec: "v3",
  };
}

/** Serializes a NormalizedCard back into a validated V2 or V3 card object. Downgrading a V3-
 * sourced card to V2 intentionally drops the V3-only fields (group_only_greetings, assets, ...)
 * — there's no V2 slot to put them in, so exporting as V2 is a deliberate compatibility choice,
 * not a bug. */
export function denormalize(card: NormalizedCard, targetSpec: "v2" | "v3"): CardV2 | CardV3 {
  const { sourceSpec: _sourceSpec, ...data } = card;

  if (targetSpec === "v2") {
    const v2Data = { ...data };
    for (const key of V3_ONLY_KEYS) delete (v2Data as Record<string, unknown>)[key];
    return cardV2Schema.parse({ spec: "chara_card_v2", spec_version: "2.0", data: v2Data });
  }

  return cardV3Schema.parse({ spec: "chara_card_v3", spec_version: "3.0", data });
}
