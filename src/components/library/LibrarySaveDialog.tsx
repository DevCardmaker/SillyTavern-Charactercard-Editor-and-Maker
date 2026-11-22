import { useState } from "react";
import { saveCardsToLibrary } from "../../io/librarySave";
import { useCardStore } from "../../state/cardStore";
import { useLibrarySaveStore } from "../../state/librarySaveStore";

/** Copies the open card — or all open cards as a group — into the library. */
export function LibrarySaveDialog({ onError }: { onError: (message: string) => void }) {
  const request = useLibrarySaveStore((s) => s.request);
  const close = useLibrarySaveStore((s) => s.close);
  const characters = useCardStore((s) => s.characters);
  const activeId = useCardStore((s) => s.activeId);
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!request) return null;

  const ids = request === "group" ? characters.map((c) => c.id) : activeId ? [activeId] : [];
  const needsGroup = request === "group";

  function finish() {
    setGroup("");
    setDone(null);
    close();
  }

  async function handleSave() {
    setBusy(true);
    try {
      const { added, same, skipped } = await saveCardsToLibrary(ids, group.trim() || null);
      const parts = [`${added} card${added === 1 ? "" : "s"} added`];
      if (same > 0) parts.push(`${same} already there unchanged`);
      if (skipped.length > 0) parts.push(`skipped: ${skipped.join(", ")}`);
      setDone(`${parts.join(", ")}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      finish();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal st-dialog">
        <h3>{needsGroup ? `Save ${ids.length} open cards to the library as a group` : "Save the open card to the library"}</h3>
        {!done ? (
          <label className="field">
            <span className="field-label">{needsGroup ? "Group name" : "Group (optional)"}</span>
            <input className="field-input" autoFocus value={group} onChange={(e) => setGroup(e.target.value)} placeholder={needsGroup ? "e.g. Familie Berg" : "leave empty for the top level"} />
            <span className="field-hint">A copy goes into the library; the open card keeps its own file. An identical card already there is simply written again, a changed one is added as a second file.</span>
          </label>
        ) : (
          <p className="st-done">✓ {done}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={finish}>
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button type="button" onClick={() => void handleSave()} disabled={busy || ids.length === 0 || (needsGroup && !group.trim())}>
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
