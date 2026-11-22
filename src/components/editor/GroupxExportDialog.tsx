import { useState } from "react";
import { exportOpenCardsAsGroupx } from "../../io/groupxIO";
import { useCardStore } from "../../state/cardStore";

/** Packs the open cards into one GroupX file — a name and the order (the order of first messages
 * in a group chat). Linked shared lorebooks that are open go in too. */
export function GroupxExportDialog({ onClose }: { onClose: () => void }) {
  const characters = useCardStore((s) => s.characters);
  const [order, setOrder] = useState<string[]>(() => characters.map((c) => c.id));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, delta: number) {
    setOrder((o) => {
      const target = index + delta;
      if (target < 0 || target >= o.length) return o;
      const next = [...o];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const path = await exportOpenCardsAsGroupx(name.trim(), order);
      if (path) setDone(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal st-dialog">
        <h3>Export the open cards as GroupX</h3>
        {!done ? (
          <>
            <p className="field-hint">
              One file with all cards in this order, plus the shared lorebooks they're linked to (if open in the Lorebooks mode) —
              to pass on or keep. File → Open GroupX… opens it again.
            </p>
            <label className="field">
              <span className="field-label">Group name</span>
              <input className="field-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Familie Berg" />
            </label>
            <ol className="st-group-members">
              {order.map((id, index) => {
                const slot = characters.find((c) => c.id === id);
                if (!slot) return null;
                return (
                  <li key={id}>
                    <span className="st-member-name">{slot.card.name || "Unnamed card"}</span>
                    <button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
                      ↑
                    </button>
                    <button type="button" className="secondary" disabled={index === order.length - 1} onClick={() => move(index, 1)}>
                      ↓
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="st-done">✓ Saved as {done}</p>
        )}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button type="button" onClick={() => void handleExport()} disabled={busy || !name.trim() || order.length < 2}>
              {busy ? "Saving…" : "Export…"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
