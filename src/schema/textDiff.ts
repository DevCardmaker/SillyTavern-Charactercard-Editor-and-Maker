/** A word-level comparison of two texts, for showing what changed between card versions. */
export type DiffPart = { kind: "same" | "removed" | "added"; text: string };

/** Above this many table cells, the part that differs is shown as one replaced block instead:
 * comparing word by word needs a table of this size, and a card's fields rarely get near it. */
const MAX_TABLE_CELLS = 4_000_000;

const tokenize = (text: string): string[] => text.match(/\s+|[^\s]+/g) ?? [];

/** Parts in reading order; joining "same" + "removed" gives `before`, "same" + "added" gives `after`. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };

  push("same", a.slice(0, start).join(""));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if ((midA.length + 1) * (midB.length + 1) > MAX_TABLE_CELLS) {
    push("removed", midA.join(""));
    push("added", midB.join(""));
  } else {
    middleDiff(midA, midB, push);
  }
  push("same", a.slice(endA).join(""));
  return parts;
}

/** Longest common subsequence, walked from the front so removals come before their replacements. */
function middleDiff(a: string[], b: string[], push: (kind: DiffPart["kind"], text: string) => void): void {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      push("removed", a[i++]);
    } else {
      push("added", b[j++]);
    }
  }
}
