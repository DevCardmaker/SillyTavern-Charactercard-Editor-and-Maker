import { useEffect, useMemo, useState } from "react";
import type { Lorebook } from "../../schema/lorebook";
import { DEFAULT_KEY_TEST_SETTINGS, recursionMap, type KeyTestSettings, type RecursionLink, type RecursionMap } from "../../schema/lorebookKeyTest";

interface Props {
  book: Lorebook;
  onClose: () => void;
}

/** How many entries the picture shows at most — beyond that it's a tangle; the list has them all. */
const MAX_NODES = 40;

function entryLabel(book: Lorebook, index: number): string {
  const entry = book.entries[index];
  return entry?.comment?.trim() || entry?.keys.find((k) => k.trim()) || `Entry ${index + 1}`;
}

/** Which lorebook entries bring in which others through recursion: a picture of the links and a
 * list with the key that does it. Links SillyTavern won't follow (prevent / exclude recursion) are
 * shown greyed with the reason. Nothing here changes the lorebook. */
export function RecursionMapPanel({ book, onClose }: Props) {
  const [settings, setSettings] = useState<KeyTestSettings>(DEFAULT_KEY_TEST_SETTINGS);
  const [hover, setHover] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [map, setMap] = useState<RecursionMap | null>(null);

  // Worked out in a background thread: a lorebook with thousands of keys takes seconds.
  useEffect(() => {
    setMap(null);
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../../workers/recursionWorker.ts", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) {
      setMap(recursionMap(book, settings));
      return;
    }
    worker.onmessage = (event: MessageEvent<{ map: RecursionMap }>) => setMap(event.data.map);
    worker.onerror = () => setMap(recursionMap(book, settings));
    worker.postMessage({ id: 1, book, settings });
    return () => worker?.terminate();
  }, [book, settings]);

  const links = map?.links ?? [];
  const active = links.filter((l) => !l.blockedBy);

  // The picture: the entries with the most links, on a circle.
  const nodes = useMemo(() => {
    const degree = new Map<number, number>();
    for (const l of active) {
      degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
      degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
    }
    return [...degree.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, MAX_NODES)
      .map(([index]) => index)
      .sort((a, b) => a - b);
  }, [active]);
  const shownLinks = active.filter((l) => nodes.includes(l.from) && nodes.includes(l.to));
  const size = 520;
  const radius = size / 2 - 95;
  const position = new Map(
    nodes.map((index, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [index, { x: size / 2 + radius * Math.cos(angle), y: size / 2 + radius * Math.sin(angle), angle }];
    }),
  );
  const inLoop = new Set((map?.loops ?? []).flat());

  const needle = filter.trim().toLocaleLowerCase();
  const listed = links.filter(
    (l) =>
      !needle ||
      entryLabel(book, l.from).toLocaleLowerCase().includes(needle) ||
      entryLabel(book, l.to).toLocaleLowerCase().includes(needle) ||
      l.key.toLocaleLowerCase().includes(needle),
  );

  function toggle(key: keyof KeyTestSettings) {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }

  function lineFor(link: RecursionLink, i: number) {
    const a = position.get(link.from);
    const b = position.get(link.to);
    if (!a || !b) return null;
    // Stop short of the target circle so the arrowhead stays visible.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const end = { x: b.x - (dx / length) * 10, y: b.y - (dy / length) * 10 };
    const lit = hover === null || hover === link.from || hover === link.to;
    return (
      <line
        key={i}
        x1={a.x}
        y1={a.y}
        x2={end.x}
        y2={end.y}
        className={lit ? (hover === null ? "rmap-link" : "rmap-link lit") : "rmap-link dim"}
        markerEnd="url(#rmap-arrow)"
      />
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal rmap-modal">
        <h3>Recursion map</h3>
        <p className="field-hint">
          An arrow from A to B means: when A is inserted, a key of B appears in A's text, so SillyTavern brings in B too (with
          recursive scanning on). Hover an entry to see only its links.
        </p>
        <div className="ai-assist-field-checkboxes">
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={settings.matchWholeWords} onChange={() => toggle("matchWholeWords")} />
            Match whole words
          </label>
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={settings.caseSensitive} onChange={() => toggle("caseSensitive")} />
            Case-sensitive
          </label>
        </div>

        {!map ? (
          <p className="field-hint">Working out the links{book.entries.length > 150 ? ` between ${book.entries.length} entries — this takes a few seconds` : ""}…</p>
        ) : map.links.length === 0 ? (
          <p>No entry's text contains another entry's key — nothing is brought in through recursion.</p>
        ) : (
          <div className="rmap-layout">
            <div className="rmap-picture">
              {nodes.length > 0 ? (
                <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Recursion links between lorebook entries">
                  <defs>
                    <marker id="rmap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="rmap-arrowhead" />
                    </marker>
                  </defs>
                  {shownLinks.map(lineFor)}
                  {nodes.map((index) => {
                    const p = position.get(index);
                    if (!p) return null;
                    const right = Math.cos(p.angle) >= 0;
                    const label = entryLabel(book, index);
                    return (
                      <g
                        key={index}
                        className={hover === index ? "rmap-node lit" : "rmap-node"}
                        onMouseEnter={() => setHover(index)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <circle cx={p.x} cy={p.y} r={8} className={inLoop.has(index) ? "rmap-dot loop" : "rmap-dot"} />
                        <text
                          x={p.x + (right ? 13 : -13)}
                          y={p.y + 5}
                          textAnchor={right ? "start" : "end"}
                          className="rmap-label"
                        >
                          {label.length > 22 ? `${label.slice(0, 21)}…` : label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <p className="field-hint">All links are blocked — see the list.</p>
              )}
              {nodes.length >= MAX_NODES && (
                <p className="field-hint">The picture shows the {MAX_NODES} entries with the most links; the list has all of them.</p>
              )}
              {map.loops.length > 0 && (
                <p className="field-hint">
                  <span className="rmap-loop-mark">●</span> In a loop (they bring each other in):{" "}
                  {map.loops.map((loop) => loop.map((i) => entryLabel(book, i)).join(" ⇄ ")).join("; ")}. Harmless — each entry is
                  inserted once — but they always come together.
                </p>
              )}
            </div>

            <div className="rmap-list">
              <input
                className="field-input"
                type="search"
                placeholder="Filter by entry or key…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <p className="field-hint">
                {active.length} link{active.length === 1 ? "" : "s"}
                {map.links.length > active.length ? `, ${map.links.length - active.length} blocked` : ""}
              </p>
              <ul>
                {listed.map((link, i) => (
                  <li
                    key={i}
                    className={link.blockedBy ? "rmap-row blocked" : "rmap-row"}
                    onMouseEnter={() => setHover(link.from)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <strong>{entryLabel(book, link.from)}</strong> → <strong>{entryLabel(book, link.to)}</strong>
                    <span className="field-hint">
                      {" "}
                      via “{link.key}”
                      {link.blockedBy === "prevent" && " — not followed: the first entry prevents further recursion"}
                      {link.blockedBy === "exclude" && " — not followed: the second entry is excluded from recursion"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
