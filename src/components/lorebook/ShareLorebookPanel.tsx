import { useState } from "react";
import type { Lorebook } from "../../schema/lorebook";
import { shareStatus, sharedBookPatch, type ShareStatus } from "../../schema/sharedLorebook";
import { useCardStore } from "../../state/cardStore";

interface Props {
  book: Lorebook;
  onClose: () => void;
}

const STATUS_LABEL: Record<ShareStatus, string> = {
  synced: "linked, up to date",
  outdated: "linked, out of date",
  other: "linked to another lorebook",
  unlinked: "not linked",
};

/** Distributes a standalone lorebook to open character tabs: each selected card gets an embedded
 * copy plus the `extensions.world` link (see `sharedBookPatch`). Cards already linked to this
 * lorebook start selected; nothing is written to disk — the cards just become dirty, like after
 * any other bulk edit, and are saved from the Characters mode. */
export function ShareLorebookPanel({ book, onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const updateSlotCard = useCardStore((s) => s.updateSlotCard);
  const [selected, setSelected] = useState(
    () => new Set(characters.filter((c) => ["synced", "outdated"].includes(shareStatus(c.card, book))).map((c) => c.id)),
  );
  const [synced, setSynced] = useState<number | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSync() {
    // Re-read the store rather than the render-time snapshot, so every card gets the patch
    // computed against its latest state.
    const current = useCardStore.getState().characters.filter((c) => selected.has(c.id));
    for (const c of current) updateSlotCard(c.id, sharedBookPatch(c.card, book));
    setSynced(current.length);
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Sync “{book.name}” to characters</h3>
        <p className="field-hint">
          Each selected card gets this lorebook embedded and is linked to it by name. In SillyTavern, the first imported
          card creates the World Info “{book.name}”, every further card links to that same World Info. Later changes:
          import this lorebook file into SillyTavern's World Info panel, then sync and save the cards again.
        </p>

        {characters.length === 0 ? (
          <p>No characters open. Open the cards that should share this lorebook in the Characters mode first.</p>
        ) : (
          <div className="share-lorebook-list">
            {characters.map((c) => {
              const status = shareStatus(c.card, book);
              return (
                <label key={c.id} className="share-lorebook-row">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span>{c.card.name || "New card"}</span>
                  <span className={`share-status share-status-${status}`}>
                    {STATUS_LABEL[status]}
                    {status === "other" && ` (“${String(c.card.extensions.world)}”)`}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {synced !== null && (
          <p className="field-hint">
            Updated {synced} card(s). They're marked as unsaved — save them in the Characters mode (e.g. “Save Group…”).
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={handleSync} disabled={selected.size === 0}>
            Sync to {selected.size} card(s)
          </button>
        </div>
      </div>
    </div>
  );
}
