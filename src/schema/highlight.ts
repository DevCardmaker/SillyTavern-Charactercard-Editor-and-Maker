/** Splitting roleplay text into coloured parts for the text fields: dialogue in quotes, *actions*
 * between asterisks, and {{macros}} / <tags> — those also inside dialogue and actions. A quote or
 * asterisk that isn't closed (yet, while typing) stays plain, so the rest of the text doesn't
 * change colour with every keystroke. */

export type HighlightSpan = "dialogue" | "action" | null;
export type HighlightToken = "macro" | "tag" | null;

export interface HighlightPart {
  text: string;
  span: HighlightSpan;
  token: HighlightToken;
}

// Dialogue: any opening quote up to the next closing one — writers (and AI models) mix them, e.g.
// „German“, „German", “English”, "straight", »German« and «French». And *actions*. One line at most.
const SPANS = /„[^„“”"\n]*["“”]|“[^„“”"\n]*["“”]|"[^„“”"\n]*["“”]|»[^«»\n]*«|«[^«»\n]*»|\*[^*\n]+\*/g;
const TOKENS = /\{\{[^{}\n]*\}\}|<\/?[A-Za-z][\w-]*>/g;

function splitTokens(text: string, span: HighlightSpan, out: HighlightPart[]) {
  let last = 0;
  for (const match of text.matchAll(TOKENS)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), span, token: null });
    out.push({ text: match[0], span, token: match[0].startsWith("{{") ? "macro" : "tag" });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), span, token: null });
}

export function highlightParts(text: string): HighlightPart[] {
  const out: HighlightPart[] = [];
  let last = 0;
  for (const match of text.matchAll(SPANS)) {
    const at = match.index ?? 0;
    if (at > last) splitTokens(text.slice(last, at), null, out);
    splitTokens(match[0], match[0].startsWith("*") ? "action" : "dialogue", out);
    last = at + match[0].length;
  }
  if (last < text.length) splitTokens(text.slice(last), null, out);
  return out;
}
