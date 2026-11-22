import { useCallback, useEffect, useState } from "react";
import { describeVersion, listCardVersions, namedSnapshotReason, type CardVersion } from "../../io/cardHistory";
import { confirmAction } from "../../io/confirmDiscard";
import { writeSnapshotBackup } from "../../io/fileIO";
import { deleteFile } from "../../io/rawFile";
import { useCardStore } from "../../state/cardStore";
import { CardHistoryPanel } from "./CardHistoryPanel";

/** Sidebar list of the open card's older versions: every save leaves one, and snapshots saved here by
 * name sit in the same `backups/` folder. Picking one opens the comparison. */
export function SnapshotsPanel() {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const filePath = useCardStore((s) => s.currentFilePath);
  const isDirty = useCardStore((s) => s.isDirty);
  const activeId = useCardStore((s) => s.activeId);
  const [versions, setVersions] = useState<CardVersion[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparePath, setComparePath] = useState<string | null>(null);
  const cardName = card?.name ?? "";

  const refresh = useCallback(() => {
    let cancelled = false;
    void listCardVersions(filePath, cardName).then((found) => {
      if (!cancelled) setVersions(found);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath, cardName]);

  // A save adds a version, so look again whenever the card turns clean or another card is shown.
  useEffect(() => {
    if (!isDirty) return refresh();
  }, [isDirty, activeId, refresh]);
  useEffect(() => refresh(), [refresh]);

  async function handleSaveSnapshot() {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      await writeSnapshotBackup(card, filePath, namedSnapshotReason(name), avatarPng);
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(version: CardVersion) {
    const { label, named } = describeVersion(version.reason);
    const what = named ? `the snapshot “${label}”` : `the version from ${version.time.toLocaleString()}`;
    if (!(await confirmAction(`Delete ${what}? The file in the backups folder is removed for good.`, "Delete snapshot"))) return;
    setError(null);
    try {
      await deleteFile(version.path);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!card) return null;

  return (
    <div className="snapshots-panel">
      {!filePath ? (
        <p className="field-hint">
          Save the card once — from then on every save keeps the previous state here, and you can save snapshots by name.
        </p>
      ) : (
        <>
          <form
            className="snapshot-new"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveSnapshot();
            }}
          >
            <input
              type="text"
              placeholder="Snapshot name (optional)"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" disabled={busy} title="Keep the card as it is right now, unsaved edits included">
              Save snapshot
            </button>
          </form>
          {error && <p className="field-error">{error}</p>}
          {versions?.length === 0 ? (
            <p className="field-hint">No older versions yet. Each save keeps the previous state as a version.</p>
          ) : (
            <ul className="snapshot-list">
              {versions?.map((version) => {
                const { label, named } = describeVersion(version.reason);
                return (
                  <li key={version.path} className="snapshot-row">
                    <button type="button" className="snapshot-item" onClick={() => setComparePath(version.path)}>
                      <span className={named ? "snapshot-label named" : "snapshot-label"}>{named ? `📌 ${label}` : label}</span>
                      <span className="field-hint">{version.time.toLocaleString()}</span>
                    </button>
                    <button
                      type="button"
                      className="snapshot-delete"
                      title="Delete this snapshot"
                      onClick={() => void handleDelete(version)}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {comparePath && (
        <CardHistoryPanel store={useCardStore} initialPath={comparePath} onClose={() => setComparePath(null)} />
      )}
    </div>
  );
}
