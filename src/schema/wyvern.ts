/** A WyvernChat character (from its public API) as a SillyTavern V2 card. Wyvern only exports
 * files for logged-in users, but every field a card needs is public. */

const text = (value: unknown) => (typeof value === "string" ? value : "");
const texts = (value: unknown) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v : typeof v === "object" && v ? text((v as Record<string, unknown>).content ?? (v as Record<string, unknown>).text) : "")).filter((v) => v.trim())
    : [];

export function wyvernToCard(raw: unknown): { card: Record<string, unknown>; avatarUrl: string | null; name: string } {
  if (!raw || typeof raw !== "object") throw new Error("WyvernChat sent no character.");
  const c = raw as Record<string, unknown>;
  const name = text(c.name).trim();
  if (!name) throw new Error("WyvernChat sent a character without a name (private, or removed?).");
  const creator = (c.creator && typeof c.creator === "object" ? c.creator : {}) as Record<string, unknown>;
  const notes = [text(c.tagline).trim(), text(c.creator_notes).trim()].filter(Boolean).join("\n\n");
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name,
      description: text(c.description),
      personality: text(c.personality),
      scenario: text(c.scenario),
      first_mes: text(c.first_mes),
      mes_example: text(c.mes_example),
      alternate_greetings: [...texts(c.alternate_greetings), ...texts(c.greetings)],
      creator_notes: notes,
      system_prompt: text(c.pre_history_instructions),
      post_history_instructions: text(c.post_history_instructions),
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === "string") : [],
      creator: text(creator.displayName ?? creator.username ?? creator.name),
      character_version: "",
      extensions: { source: "wyvern.chat", wyvern_id: text(c.id ?? c._id) },
    },
  };
  const avatar = text(c.avatar).trim();
  return { card, avatarUrl: /^https?:\/\//.test(avatar) ? avatar : null, name };
}
