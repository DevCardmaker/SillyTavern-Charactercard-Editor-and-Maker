import { useEffect, useMemo, useState } from "react";
import { listCardVersions, readCardVersion, sameImage, type CardVersion, type CardVersionData } from "../../io/cardHistory";
import { compareCards, restoreAllPatch, type CardChange } from "../../schema/cardDiff";
import type { NormalizedCard } from "../../schema/normalize";
import { wordDiff } from "../../schema/textDiff";
import type { CardStore } from "../../state/cardStore";

interface Props {
  store: CardStore;
  onClose: () => void;
}

/** Unchanged stretches longer than this fold away, keeping a little of each end for orientation. */
const FOLD_OVER = 400;
const FOLD_KEEP = 120;

function DiffText({ before, after }: { before: string; after: string }) {
  const [unfolded, setUnfolded] = useState(false);
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  const foldable = parts.some((part) => part.kind === "same" && part.text.length > FOLD_OVER);
  return (
    <>
      <div className="history-diff">
        {parts.map((part, i) => {
          if (part.kind === "removed") return <del key={i}>{part.text}</del>;
          if (part.kind === "added") return <ins key={i}>{part.text}</ins>;
          if (unfolded || part.text.length <= FOLD_OVER) return <span key={i}>{part.text}</span>;
          return (
            <span key={i}>
              {i > 0 && part.text.slice(0, FOLD_KEEP)}
              <span className="history-fold"> … </span>
              {i < parts.length - 1 && part.text.slice(-FOLD_KEEP)}
            </span>
          );
        })}
      </div>
      {foldable && (
        <button type="button" className="secondary history-unfold" onClick={() => setUnfolded((v) => !v)}>
          {unfolded ? "Fold unchanged text" : "Show unchanged text"}
        </button>
      )}
    </>
  );
}

function ChangeBody({ change }: { change: CardChange }) {
  if (change.text) return <DiffText before={change.text.before} after={change.text.after} />;
  return (
    <>
      {change.items?.map((item, i) => (
        <div key={i} className="history-item">
          <div className="history-item-label">
            {item.label}
            {item.before !== undefined && item.after === undefined && " · only in this version"}
            {item.before === undefined && item.after !== undefined && " · only now"}
          </div>
          {(item.before !== undefined || item.after !== undefined) && (
            <DiffText before={item.before ?? ""} after={item.after ?? ""} />
          )}
        </div>
      ))}
    </>
  );
}

function PngPreview({ png, alt }: { png: Uint8Array | null; alt: string }) {
  const url = useMemo(() => (png ? URL.createObjectURL(new Blob([png], { type: "image/png" })) : null), [png]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url ? <img src={url} alt={alt} /> : <span className="field-hint">No image</span>;
}

/** Older versions of the open card, from its backups: what differs from the card as it is now, and
 * bringing back all of it or single sections. A restore only changes the open card, not the file. */
export function CardHistoryPanel({ store, onClose }: Props) {
  const card = store((s) => s.card);
  const avatarPng = store((s) => s.avatarPng);
  const filePath = store((s) => s.currentFilePath);
  const updateCard = store((s) => s.updateCard);
  const setAvatarPng = store((s) => s.setAvatarPng);

  const [versions, setVersions] = useState<CardVersion[] | null>(null);
  const [selected, setSelected] = useState<CardVersion | null>(null);
  const [data, setData] = useState<CardVersionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ card: NormalizedCard; avatarPng: Uint8Array | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCardVersions(filePath, card?.name ?? "").then((found) => {
      if (cancelled) return;
      setVersions(found);
      setSelected(found[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
    // The list stays as opened: nothing in this window adds a version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setData(null);
    setError(null);
    readCardVersion(selected.path)
      .then((read) => {
        if (!cancelled) setData(read);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const changes = useMemo(() => (data && card ? compareCards(data.card, card) : []), [data, card]);
  const imageDiffers = !!data?.avatarPng && !sameImage(data.avatarPng, avatarPng);
  const nothingDiffers = !!data && changes.length === 0 && !imageDiffers;

  function rememberForUndo() {
    if (card) setUndo({ card, avatarPng });
  }

  function restore(patch: Partial<NormalizedCard>) {
    rememberForUndo();
    updateCard(patch);
  }

  function restoreImage() {
    if (!data?.avatarPng) return;
    rememberForUndo();
    setAvatarPng(data.avatarPng);
  }

  function restoreAll() {
    if (!data) return;
    rememberForUndo();
    updateCard(restoreAllPatch(changes));
    if (imageDiffers && data.avatarPng) setAvatarPng(data.avatarPng);
  }

  function handleUndo() {
    if (!undo || !card) return;
    const keys = Object.keys({ ...card, ...undo.card });
    updateCard(Object.fromEntries(keys.map((key) => [key, undo.card[key]])) as Partial<NormalizedCard>);
    if (undo.avatarPng) {
      setAvatarPng(undo.avatarPng);
    } else {
      // The card had no image before the restore; the store's setter only takes one.
      store.setState((s) => ({
        avatarPng: null,
        characters: s.characters.map((c) => (c.id === s.activeId ? { ...c, avatarPng: null } : c)),
      }));
    }
    setUndo(null);
  }

  return (
    <div className="modal-overlay">
      <div className="modal history-modal">
        <div className="history-head">
          <h3>Version history</h3>
          {undo && (
            <button type="button" className="secondary" onClick={handleUndo}>
              Undo restore
            </button>
          )}
        </div>

        {!filePath ? (
          <p className="field-hint">This card hasn't been saved yet, so it has no older versions.</p>
        ) : versions?.length === 0 ? (
          <p className="field-hint">
            No older versions yet. Each time you save over this file, the previous state is kept as a version.
          </p>
        ) : (
          <div className="history-layout">
            <ul className="history-versions">
              {versions?.map((version) => (
                <li key={version.path}>
                  <button
                    type="button"
                    className={version === selected ? "history-version active" : "history-version"}
                    onClick={() => setSelected(version)}
                  >
                    {version.time.toLocaleString()}
                    {version.reason && <span className="field-hint"> {version.reason.replace(/-/g, " ")}</span>}
                  </button>
                </li>
              ))}
            </ul>

            <div className="history-changes">
              {error && <p className="field-error">{error}</p>}
              {nothingDiffers && <p className="field-hint">This version is the same as the card right now.</p>}
              {data && !nothingDiffers && (
                <div className="history-legend">
                  <span>
                    <del>only in this version</del> <ins>only now</ins>
                  </span>
                  <button type="button" onClick={restoreAll}>
                    Restore whole version
                  </button>
                </div>
              )}
              {imageDiffers && (
                <section className="history-change">
                  <div className="history-change-head">
                    <strong>Image</strong>
                    <button type="button" className="secondary" onClick={restoreImage}>
                      Restore
                    </button>
                  </div>
                  <div className="history-images">
                    <PngPreview png={data?.avatarPng ?? null} alt="This version's avatar" />
                    <PngPreview png={avatarPng} alt="Current avatar" />
                  </div>
                </section>
              )}
              {changes.map((change) => (
                <section key={change.key} className="history-change">
                  <div className="history-change-head">
                    <strong>{change.label}</strong>
                    <button type="button" className="secondary" onClick={() => restore(change.patch)}>
                      Restore
                    </button>
                  </div>
                  <ChangeBody change={change} />
                </section>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <span className="field-hint history-note">Restoring changes the open card. The file only changes when you save.</span>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
