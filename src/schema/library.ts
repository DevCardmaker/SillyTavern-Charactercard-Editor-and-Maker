/** Rules for the card library and the downloader — pure, so they're tested without files. */

/** Sites SillyTavern's own downloader knows (POST /api/content/importURL). */
const ST_HOSTS = ["chub.ai", "characterhub.org", "janitorai", "jannyai", "pygmalion.chat", "aicharactercards.com", "realm.risuai.net", "perchance.org"];

const UUID = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

/** The link as SillyTavern's downloader wants it. JannyAI (an archive of JanitorAI cards) isn't on
 * its list, but SillyTavern fetches JanitorAI cards from JannyAI anyway, by the same id. */
export function sillyTavernImportUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    const id = UUID.exec(trimmed)?.[0];
    if (host.includes("jannyai") && id) return `https://janitorai.com/characters/${id}`;
  } catch {
    // Not a URL: SillyTavern reports it.
  }
  return trimmed;
}

export type DownloadRoute = "sillytavern" | "direct";

/** How a link is fetched: sites with their own format through SillyTavern, anything else directly
 * (it has to be a card PNG or JSON then). Null for something that isn't a web address. */
export function downloadRoute(url: string): DownloadRoute | null {
  let host: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  return ST_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h)) ? "sillytavern" : "direct";
}

/** Sites the editor downloads itself, from a page link to the file's address and what it holds.
 * Botbooru: /character/99635 → /download/png/99635 (a PNG card), /lorebook/909 →
 * /api/lorebooks/909/download.json (a SillyTavern lorebook). Any other link is used as it is and has
 * to point straight at a card file then. */
export function directDownload(url: string): { url: string; kind: "card" | "lorebook" | "wyvern" } {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "botbooru.com") {
      const card = /^\/(?:character|post)\/(\d+)/.exec(parsed.pathname)?.[1];
      if (card) return { url: `https://botbooru.com/download/png/${card}`, kind: "card" };
      const book = /^\/lorebook\/(\d+)/.exec(parsed.pathname)?.[1];
      if (book) return { url: `https://botbooru.com/api/lorebooks/${book}/download.json`, kind: "lorebook" };
    }
    // Character Tavern: /character/<creator>/<name> → the card PNG in its storage.
    if (host === "character-tavern.com") {
      const match = /^\/character\/([^/]+)\/([^/?#]+)/.exec(parsed.pathname);
      if (match) return { url: `https://ct-cards.storage.character-tavern.com/${match[1]}/${match[2]}.png?action=download`, kind: "card" };
    }
    // WyvernChat: no public card file, but the character's fields are public — the card is built from them.
    if (host === "wyvern.chat" || host.endsWith(".wyvern.chat")) {
      const id = /\/characters?\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)?.[1];
      if (id) return { url: `https://api.wyvern.chat/characters/${id}`, kind: "wyvern" };
    }
  } catch {
    // Not a URL: the caller reports it.
  }
  return { url: url.trim(), kind: "card" };
}

/** One link per line; blank lines, "#" comments and repeats are left out. */
export function parseUrlList(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim();
    if (!url || url.startsWith("#") || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/** A name that's safe as a file or folder name on Linux and Windows. */
export function safeName(name: string, fallback = "card"): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 100);
  return cleaned || fallback;
}

/** The file name from a Content-Disposition header (SillyTavern URL-encodes it). */
export function fileNameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  // The encoded form (filename*=UTF-8''…) carries the real name; the plain one is often a stand-in
  // ("download.json"), so it only counts when there's no encoded one.
  const match = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header) ?? /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  if (!match) return null;
  const raw = match[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Where a new file goes: the wanted name if it's free or holds exactly the same bytes (then it's
 * simply written again), otherwise "Name-2", "Name-3" … — an existing file with the same content
 * is reused under its own name. */
export function placeInLibrary(
  wanted: string,
  existing: ReadonlyMap<string, Uint8Array>,
  bytes: Uint8Array,
): { fileName: string; duplicate: boolean } {
  const same = (other: Uint8Array) => other.length === bytes.length && other.every((b, i) => b === bytes[i]);
  const dot = wanted.lastIndexOf(".");
  const base = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : "";
  const lower = (n: string) => n.toLowerCase();
  const byLower = new Map([...existing].map(([name, data]) => [lower(name), { name, data }]));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? wanted : `${base}-${n}${ext}`;
    const found = byLower.get(lower(candidate));
    if (!found) return { fileName: candidate, duplicate: false };
    if (same(found.data)) return { fileName: found.name, duplicate: true };
  }
}

export const LOREBOOK_FOLDER = "Lorebooks";

/** A filled-in `requestProxy` block for SillyTavern's config.yaml: the proxy given here (or a
 * placeholder), and as exceptions localhost plus the local model servers among the AI profiles. */
export function stProxyExample(proxy: string, profileUrls: readonly string[]): string {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);
  for (const url of profileUrls) {
    try {
      const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
      const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host) || host.endsWith(".local");
      if (local) hosts.add(host);
    } catch {
      // Not a URL: ignore.
    }
  }
  const url = proxy.trim() || "http://192.168.0.10:8888";
  return [
    "requestProxy:",
    "  enabled: true",
    `  url: "${url}"`,
    "  bypass:",
    ...[...hosts].map((h) => `    - ${h.includes(":") ? `"${h}"` : h}`),
  ].join("\n");
}

/** Whether a downloaded JSON is a lorebook rather than a character card: World Info / V2 lorebook
 * files have entries but none of a card's fields. */
export function isLorebookJson(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.spec === "chara_card_v2" || v.spec === "chara_card_v3" || "first_mes" in v || "char_name" in v) return false;
  return "entries" in v && (Array.isArray(v.entries) || (typeof v.entries === "object" && v.entries !== null));
}
