/** A wiki page as extra background for "Cards from a story": where to ask (MediaWiki's API, used by
 * Fandom and Wikipedia) and its wikitext as plain text — infobox fields kept as "field: value"
 * lines, since those hold the facts a card needs (age, looks, job). */

export interface WikiPageRef {
  /** The API endpoints to try, in order. */
  apis: string[];
  title: string;
}

/** From a page link like https://sherlock.fandom.com/wiki/Irene_Adler or
 * https://en.wikipedia.org/wiki/Irene_Adler. Null if it doesn't look like a wiki page. */
export function parseWikiUrl(url: string): WikiPageRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const fromPath = /\/wiki\/(.+)$/.exec(parsed.pathname)?.[1];
  const title = decodeURIComponent((fromPath ?? parsed.searchParams.get("title") ?? "").replace(/_/g, " ")).trim();
  if (!title) return null;
  const host = parsed.hostname.toLowerCase();
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (host.endsWith("wikipedia.org") || host.endsWith("wikimedia.org") || host.endsWith("wiktionary.org")) {
    return { apis: [`${origin}/w/api.php`], title };
  }
  // Fandom and most other MediaWikis have it at /api.php; some at /w/api.php.
  return { apis: [`${origin}/api.php`, `${origin}/w/api.php`], title };
}

export function wikiApiUrl(api: string, title: string): string {
  const params = new URLSearchParams({ action: "parse", page: title, prop: "wikitext", format: "json", formatversion: "2", redirects: "1" });
  return `${api}?${params.toString()}`;
}

/** The top-level {{templates}} of a text, with where they start and end. */
function templates(text: string): { start: number; end: number; body: string }[] {
  const found: { start: number; end: number; body: string }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      if (depth === 0) start = i;
      depth++;
      i++;
    } else if (text[i] === "}" && text[i + 1] === "}" && depth > 0) {
      depth--;
      i++;
      if (depth === 0) found.push({ start, end: i + 1, body: text.slice(start + 2, i - 1) });
    }
  }
  return found;
}

/** [[Page|label]] → label, [[Page]] → Page; files and categories go. */
function plainLinks(text: string): string {
  return text
    .replace(/\[\[(?:File|Image|Datei|Bild|Category|Kategorie):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, "")
    .replace(/\[\[:?(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]+\]/g, "");
}

function tidy(text: string): string {
  return plainLinks(text)
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/'''''|'''|''/g, "")
    .replace(/&nbsp;/g, " ");
}

/** An infobox as "field: value" lines (pictures and empty fields left out). */
function infoboxLines(body: string): string[] {
  const lines: string[] = [];
  // Split at | that aren't inside nested links or templates.
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "[[" || two === "{{") depth++;
    if (two === "]]" || two === "}}") depth = Math.max(0, depth - 1);
    if (body[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += body[i];
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().replace(/_/g, " ");
    const value = tidy(part.slice(eq + 1)).replace(/\s+/g, " ").trim().replace(/^,\s*|,\s*$/g, "");
    if (!key || !value || /^(image|caption|img|picture|bild|gallery|imagewidth|size)\d*$/i.test(key)) continue;
    lines.push(`${key}: ${value}`);
  }
  return lines;
}

const INFOBOX = /^\s*(infobox|character|char\b|charbox|person|individual|figur)/i;

export function wikitextToPlain(wikitext: string): string {
  let text = wikitext;
  const boxes: string[] = [];
  // Inner templates first become plain where possible; the top-level ones decide what stays.
  for (const t of templates(text).reverse()) {
    const name = t.body.split("|")[0];
    const replacement = INFOBOX.test(name) ? (boxes.unshift(infoboxLines(t.body).join("\n")), "") : "";
    text = text.slice(0, t.start) + replacement + text.slice(t.end);
  }
  text = tidy(text)
    .replace(/\{\|[\s\S]*?\|\}/g, "") // tables
    .replace(/^\s*:+/gm, "")
    .replace(/^=+\s*(.*?)\s*=+\s*$/gm, "\n$1:")
    .replace(/^\*+\s*/gm, "- ")
    .replace(/^#+\s*/gm, "- ")
    .replace(/__[A-Z]+__/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [...boxes.filter(Boolean), text].join("\n\n").trim();
}
