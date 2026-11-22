import type { ReactNode } from "react";

/** **bold** and *italic* in an AI answer, shown as such — nothing else is interpreted, and the text
 * never becomes HTML, so a reply can't inject anything. Line breaks come from `white-space: pre-wrap`. */
export function SimpleMarkdown({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(match[1] !== undefined ? <strong key={at}>{match[1]}</strong> : <em key={at}>{match[2]}</em>);
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
