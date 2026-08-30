import { z } from "zod";
import { cardV2DataSchema, cardV2Schema, type CardV2 } from "./cardV2";
import { cardV3DataSchema, cardV3Schema, type CardV3 } from "./cardV3";
import { legacyV1Schema } from "./legacyV1";
import { lorebookSchema } from "./lorebook";
import { normalizeFromLegacyV1, normalizeFromV2, normalizeFromV3, type NormalizedCard } from "./normalize";

export class CardParseError extends Error {
  constructor(
    message: string,
    public readonly issues?: z.ZodIssue[],
  ) {
    super(message);
    this.name = "CardParseError";
  }
}

/** Parses raw card JSON (from a PNG's embedded chunk or a standalone .json file) into the
 * editor's normalized model. Dispatches on the `spec` field; falls back to the pre-V2 flat
 * "Tavern" shape when it's absent, since that format still circulates. */
export function parseCardJson(raw: string): NormalizedCard {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new CardParseError(`Invalid JSON: ${(err as Error).message}`);
  }

  const spec = typeof json === "object" && json !== null ? (json as Record<string, unknown>).spec : undefined;

  if (spec === "chara_card_v3") {
    const result = cardV3Schema.safeParse(json);
    if (!result.success) throw new CardParseError("Card doesn't match the V3 format.", result.error.issues);
    return normalizeFromV3(result.data);
  }

  if (spec === "chara_card_v2") {
    const result = cardV2Schema.safeParse(json);
    if (!result.success) throw new CardParseError("Card doesn't match the V2 format.", result.error.issues);
    return normalizeFromV2(result.data);
  }

  const legacy = legacyV1Schema.safeParse(json);
  if (!legacy.success) {
    throw new CardParseError(
      "No known character card format detected (neither V2, V3, nor the old flat Tavern format).",
      legacy.error.issues,
    );
  }
  return normalizeFromLegacyV1(legacy.data);
}

// --- Lenient recovery for cards that fail strict validation ------------------------------------
//
// `name` is the only field across all three formats without a `.default()` (see cardV2.ts,
// legacyV1.ts), and `character_book` is the only nested structure that can independently fail
// (a malformed lorebook entry). Those are deliberately the *only* two things this recovery path
// relaxes — `.catch()` substitutes a safe fallback instead of failing the whole card. Anything
// else wrong (a broken `data` wrapper, a garbled top-level field) still throws, since there's
// nothing sensible to recover into.

const cardV2DataLenientSchema = cardV2DataSchema.extend({
  name: z.string().catch(""),
  character_book: lorebookSchema.nullish().catch(undefined),
});

const cardV3DataLenientSchema = cardV3DataSchema.extend({
  name: z.string().catch(""),
  character_book: lorebookSchema.nullish().catch(undefined),
});

const legacyV1LenientSchema = legacyV1Schema.extend({
  name: z.string().catch(""),
});

const RECOVERABLE_FIELDS = new Set(["name", "character_book"]);

/** True only if every validation issue is confined to `name` or (anywhere within)
 * `character_book` — the two fields the lenient schemas above relax. `nestedUnderData` accounts
 * for V2/V3 issue paths being relative to the outer card (`["data", "name", ...]`) vs. the flat
 * legacy shape (`["name"]`). Anything else present in `issues` means this isn't a case the
 * lenient schemas can actually fix, so the caller should not offer to load it anyway. */
function onlyRecoverableIssues(issues: z.ZodIssue[], nestedUnderData: boolean): boolean {
  return issues.every((issue) => {
    const field = nestedUnderData ? issue.path[1] : issue.path[0];
    return typeof field === "string" && RECOVERABLE_FIELDS.has(field);
  });
}

/** Best-effort recovery for a card that `parseCardJson` already rejected. `issues` should be
 * the ones `parseCardJson` threw with, so this only needs to re-run once, against the schema
 * variant matching what actually failed — not silently attempt every format in turn. Returns
 * `null` when recovery isn't possible or safe: broken JSON syntax, an unrecognized format, or
 * validation failures outside `name`/`character_book`. The caller is expected to back up the
 * original file and get the user's explicit confirmation before treating the result as loaded —
 * this function only builds the card, it doesn't decide whether loading it is a good idea. */
export function parseCardJsonLeniently(raw: string, issues: z.ZodIssue[]): NormalizedCard | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const spec = typeof json === "object" && json !== null ? (json as Record<string, unknown>).spec : undefined;
  const record = json as Record<string, unknown>;

  if (spec === "chara_card_v3") {
    if (!onlyRecoverableIssues(issues, true)) return null;
    const result = cardV3DataLenientSchema.safeParse(record.data);
    if (!result.success) return null;
    return normalizeFromV3({ spec: "chara_card_v3", spec_version: "3.0", data: result.data } as CardV3);
  }

  if (spec === "chara_card_v2") {
    if (!onlyRecoverableIssues(issues, true)) return null;
    const result = cardV2DataLenientSchema.safeParse(record.data);
    if (!result.success) return null;
    return normalizeFromV2({ spec: "chara_card_v2", spec_version: "2.0", data: result.data } as CardV2);
  }

  if (!onlyRecoverableIssues(issues, false)) return null;
  const legacy = legacyV1LenientSchema.safeParse(json);
  if (!legacy.success) return null;
  return normalizeFromLegacyV1(legacy.data);
}
