/** Greetings only for group chats, as used by SillyTavern's "Group Greetings" extension. The list
 * lives in two places: the V3 field `group_only_greetings`, and `extensions.group_greetings`, which
 * is older and the only place a V2 card can keep it. The editor works with one list, the V3 field:
 * the other one is read when a card is loaded and written when it's saved. */

const LEGACY_KEY = "group_greetings";
const MODE_KEY = "group_greetings_mode";

/** How the extension chooses a greeting when a group chat starts. */
export const GROUP_GREETING_MODE = { RANDOM: 0, PICK: 1 } as const;
export type GroupGreetingMode = (typeof GROUP_GREETING_MODE)[keyof typeof GROUP_GREETING_MODE];

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The same choice the extension makes: the V3 field, unless it's empty and the older one isn't. */
export function resolveGroupGreetings(data: { group_only_greetings?: unknown; extensions?: Record<string, unknown> }): string[] {
  const list = stringsOf(data.group_only_greetings);
  return list.length > 0 ? list : stringsOf(data.extensions?.[LEGACY_KEY]);
}

/** Brings the older field in line before saving. A V2 card needs it, because that's where its
 * greetings stay. A V3 card only gets it updated if it already has one: left behind, the old list
 * would come back as soon as the V3 list is emptied. A V3 card without one stays as it was. */
export function withLegacyGroupGreetings<T extends { group_only_greetings?: string[]; extensions: Record<string, unknown> }>(
  data: T,
  targetSpec: "v2" | "v3",
): T {
  const list = data.group_only_greetings ?? [];
  const needed = LEGACY_KEY in data.extensions || (targetSpec === "v2" && list.length > 0);
  return needed ? { ...data, extensions: { ...data.extensions, [LEGACY_KEY]: list } } : data;
}

export function getGroupGreetingMode(extensions: Record<string, unknown>): GroupGreetingMode {
  return extensions[MODE_KEY] === GROUP_GREETING_MODE.PICK ? GROUP_GREETING_MODE.PICK : GROUP_GREETING_MODE.RANDOM;
}

export function withGroupGreetingMode(extensions: Record<string, unknown>, mode: GroupGreetingMode): Record<string, unknown> {
  return { ...extensions, [MODE_KEY]: mode };
}

/** Everything in `extensions` except the older list, which only follows the V3 field. */
export function withoutLegacyGroupGreetings(extensions: Record<string, unknown>): Record<string, unknown> {
  const { [LEGACY_KEY]: _legacy, ...rest } = extensions;
  return rest;
}
