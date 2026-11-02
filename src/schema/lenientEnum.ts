import { z } from "zod";

/** An enum for AI replies that never fails the whole reply over one value. Providers without
 * schema-constrained decoding (DeepSeek falls back to `json_object`) write their own words
 * ("protagonist", "Location", "first message"); `guess` maps them to an allowed value. The JSON
 * schema sent to the model still lists only `values` — strict providers stay strict. A preprocess,
 * not `.catch(fn)`: `z.toJSONSchema` throws on dynamic catch values. */
export function lenientEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  guess: (text: string) => T[number],
) {
  return z.preprocess((value) => {
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    const exact = values.find((v) => v === text.replace(/[\s-]+/g, "_"));
    return exact ?? guess(text);
  }, z.enum(values));
}

/** Card fields as models like to name them: "Description", "first message", "greeting". Falls
 * back to the first allowed field; a change for the wrong field is caught later anyway (its quote
 * isn't found, or the review shows the field). */
export function guessCardField<const T extends readonly [string, ...string[]]>(fields: T) {
  return (text: string): T[number] => {
    const has = (f: string) => fields.includes(f);
    if (has("first_mes") && /first|greeting|opening/.test(text)) return "first_mes";
    if (has("personality") && /personal/.test(text)) return "personality";
    if (has("scenario") && /scenari/.test(text)) return "scenario";
    return fields[0];
  };
}
