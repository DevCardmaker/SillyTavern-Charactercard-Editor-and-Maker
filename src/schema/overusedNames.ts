/** Names AI models reach for again and again, and that readers of AI-written cards recognize at
 * once. Only a hint for the name field: a character may well be called this on purpose. Everyday
 * names like Sarah or Lily are left out on purpose: they'd warn far too often to mean anything. */
const OVERUSED_NAMES = new Set([
  // First names
  "aelara",
  "aelith",
  "aurelia",
  "cassian",
  "elara",
  "elaria",
  "elarion",
  "eldrin",
  "elowen",
  "elysia",
  "isolde",
  "kael",
  "kaelan",
  "kaelen",
  "kaelith",
  "kaelthas",
  "liora",
  "lirael",
  "lucien",
  "lyra",
  "lyria",
  "lysander",
  "lysandra",
  "maeve",
  "nyra",
  "nyx",
  "seraphina",
  "seraphine",
  "sylvara",
  "thalia",
  "valeria",
  "vesper",
  "zephyr",
  "zephyra",
  // Surnames
  "ashford",
  "blackwood",
  "nightshade",
  "ravenwood",
  "thorne",
  "vance",
  "voss",
]);

/** The first part of the name that is on the list, as it is written there. */
export function findOverusedName(name: string): string | undefined {
  return name.match(/\p{L}+/gu)?.find((part) => OVERUSED_NAMES.has(part.toLowerCase()));
}

export function overusedNameWarning(name: string): string | undefined {
  const found = findOverusedName(name);
  return found ? `AI models use the name “${found}” very often. Fine if you chose it on purpose.` : undefined;
}
