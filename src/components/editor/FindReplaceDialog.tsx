import { useEffect, useMemo, useState } from "react";
import { writeSnapshotBackup } from "../../io/fileIO";
import { cardTextSpots, countMatches, findPattern, matchSnippets, replaceInCard } from "../../schema/findReplace";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";

/** Find & replace across the open card — for a name the AI wrote instead of {{char}} / {{user}}, or
 * to rename a character everywhere. Shows every place first; a snapshot is kept before replacing. */
export function FindReplaceDialog({ onClose }: { onClose: () => void }) {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const filePath = useCardStore((s) => s.currentFilePath);
  const updateCard = useCardStore((s) => s.updateCard);
  const personas = usePersonaStore((s) => s.characters);
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(true);
  const [withLorebook, setWithLorebook] = useState(true);
  const [renameCard, setRenameCard] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = { matchCase, wholeWords };
  const pattern = useMemo(() => findPattern(find, { matchCase, wholeWords }), [find, matchCase, wholeWords]);
  const hits = useMemo(() => {
    if (!card || !pattern) return [];
    return cardTextSpots(card, withLorebook)
      .map((spot) => ({ spot, count: countMatches(spot.text, pattern), snippets: matchSnippets(spot.text, pattern) }))
      .filter((h) => h.count > 0);
  }, [card, pattern, withLorebook]);
  const chosen = hits.filter((h) => !excluded.has(h.spot.id));
  const total = chosen.reduce((n, h) => n + h.count, 0);
  const personaNames = [...new Set(personas.map((p) => p.card.name.trim()).filter(Boolean))];
  const isMacro = /^\{\{.*\}\}$/.test(replacement.trim());

  // New search, new choice of places.
  useEffect(() => {
    setExcluded(new Set());
    setDone(null);
  }, [find, matchCase, wholeWords, withLorebook]);

  if (!card) return null;

  async function handleReplace() {
    if (!card || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Many fields at once can't be taken back with Ctrl+Z — keep the card as it was.
      await writeSnapshotBackup(card, filePath, "before-replace", avatarPng);
      const { patch, count } = replaceInCard(card, find, replacement, options, new Set(chosen.map((h) => h.spot.id)));
      const renamed = renameCard && !isMacro && replacement.trim() && card.name.trim() === find.trim();
      updateCard(renamed ? { ...patch, name: replacement.trim() } : patch);
      setDone(
        `Replaced ${count} time${count === 1 ? "" : "s"} in ${chosen.length} place${chosen.length === 1 ? "" : "s"}${renamed ? ", and renamed the card" : ""}. The card as it was is kept as a snapshot (“before replace”).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal find-dialog">
        <h3>Find &amp; replace in “{card.name || "this card"}”</h3>
        <div className="find-quick">
          <span className="field-hint">Quick:</span>
          {card.name.trim() && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setFind(card.name.trim());
                setReplacement("{{char}}");
                setRenameCard(false);
              }}
            >
              “{card.name.trim()}” → {"{{char}}"}
            </button>
          )}
          {personaNames.map((name) => (
            <button
              key={name}
              type="button"
              className="secondary"
              onClick={() => {
                setFind(name);
                setReplacement("{{user}}");
                setRenameCard(false);
              }}
            >
              “{name}” → {"{{user}}"}
            </button>
          ))}
          {card.name.trim() && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setFind(card.name.trim());
                setReplacement("");
                setRenameCard(true);
              }}
            >
              Rename the character…
            </button>
          )}
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Find</span>
            <input className="field-input" autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="e.g. Wendy" />
          </label>
          <label className="field">
            <span className="field-label">Replace with</span>
            <input className="field-input" value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="e.g. {{char}} — or empty to remove" />
          </label>
        </div>
        <div className="ai-assist-field-checkboxes">
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} />
            Whole words (“Wendy's” yes, “Wendys” no)
          </label>
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Match case
          </label>
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={withLorebook} onChange={(e) => setWithLorebook(e.target.checked)} />
            Also in the lorebook
          </label>
          {!isMacro && card.name.trim() && find.trim() === card.name.trim() && (
            <label className="ai-assist-field-checkbox">
              <input type="checkbox" checked={renameCard} onChange={(e) => setRenameCard(e.target.checked)} />
              Also rename the card
            </label>
          )}
        </div>

        <div className="find-results">
          {done && <p className="st-done">✓ {done}</p>}
          {done && hits.length === 0 && <p className="field-hint">Nothing of it is left in the card.</p>}
          {!done && find && hits.length === 0 && <p className="field-hint">Not found anywhere in the card.</p>}
          {hits.length > 0 && !done && (
            <>
              <p className="field-hint">
                {total} match{total === 1 ? "" : "es"} in {chosen.length} of {hits.length} place{hits.length === 1 ? "" : "s"} — untick
                places to leave them as they are.
              </p>
              <ul className="find-list">
                {hits.map(({ spot, count, snippets }) => (
                  <li key={spot.id}>
                    <label className="field-inline">
                      <input
                        type="checkbox"
                        checked={!excluded.has(spot.id)}
                        onChange={(e) =>
                          setExcluded((set) => {
                            const next = new Set(set);
                            if (e.target.checked) next.delete(spot.id);
                            else next.add(spot.id);
                            return next;
                          })
                        }
                      />
                      <strong>{spot.label}</strong>
                      <span className="field-hint"> · {count}×</span>
                    </label>
                    {snippets.map((s, i) => (
                      <div key={i} className="find-snippet">
                        {s.before}
                        <mark>{s.match}</mark>
                        {replacement && <ins>{replacement}</ins>}
                        {s.after}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void handleReplace()}
            disabled={busy || chosen.length === 0 || (renameCard && !replacement.trim())}
            title={renameCard && !replacement.trim() ? "Enter the new name first" : undefined}
          >
            {busy ? "Replacing…" : `Replace ${total || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
