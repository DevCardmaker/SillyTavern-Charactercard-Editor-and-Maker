import type { LorebookEntry } from "./lorebook";

/** Flags an unequal count of `{{`/`}}` — usually a typo in a macro like {{char}}/{{user}}
 * rather than intentional literal braces. */
export function unbalancedMacroWarning(text: string): string | undefined {
  const open = (text.match(/\{\{/g) ?? []).length;
  const close = (text.match(/\}\}/g) ?? []).length;
  return open === close
    ? undefined
    : "Unequal number of opening/closing macro braces — possibly a typo";
}

export function emptyNameWarning(name: string): string | undefined {
  return name.trim() ? undefined : "Without a name, the card is hard to identify in SillyTavern";
}

export function emptyFirstMesWarning(first_mes: string): string | undefined {
  return first_mes.trim() ? undefined : "Without a first message, SillyTavern won't show a greeting";
}

/** A lorebook entry without keys is never triggered unless it's marked "constant". */
export function lorebookEntryMissingKeysWarning(entry: LorebookEntry): string | undefined {
  if (entry.constant) return undefined;
  const hasKeys = entry.keys.some((k) => k.trim());
  return hasKeys
    ? undefined
    : "Without keys, this entry is never inserted (unless \"Always active\" is set)";
}

/** Combines multiple optional warnings into one display string, or undefined if none apply. */
export function combineWarnings(...warnings: (string | undefined)[]): string | undefined {
  const active = warnings.filter((w): w is string => Boolean(w));
  return active.length ? active.join(" · ") : undefined;
}
