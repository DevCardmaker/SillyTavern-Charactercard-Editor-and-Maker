import { useEffect, useMemo } from "react";
import { confirmDiscardChanges } from "../../io/confirmDiscard";
import { useCardStore } from "../../state/cardStore";
import { useLorebookStore } from "../../state/lorebookStore";
import { usePersonaStore } from "../../state/personaStore";
import { useStPresetStore } from "../../state/stPresetStore";

interface OpenItem {
  id: string;
  label: string;
  dirty: boolean;
  /** undefined = this kind has no pictures; null = no picture yet. */
  png?: Uint8Array | null;
}

/** The open files of a mode (lorebooks, personas, presets) — the same list as the open cards. */
function OpenFileList({
  title,
  items,
  activeId,
  onSelect,
  onClose,
  onNew,
  onError,
}: {
  title: string;
  items: OpenItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew?: () => void;
  onError: (message: string) => void;
}) {
  async function handleClose(item: OpenItem) {
    if (item.dirty && !(await confirmDiscardChanges())) return;
    onClose(item.id);
  }
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-head">
        <span>{title}</span>
        {onNew && (
          <button type="button" className="secondary sidebar-small-button" title="New (Ctrl+N)" onClick={onNew}>
            +
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="field-hint sidebar-hint">Nothing open.</p>
      ) : (
        <ul className="card-list">
          {items.map((item) => (
            <li key={item.id} className={item.id === activeId ? "card-list-item active" : "card-list-item"}>
              <button type="button" className="card-list-select" onClick={() => onSelect(item.id)}>
                {item.png !== undefined && <Thumb png={item.png} />}
                <span className="card-list-name">{item.label}</span>
                {item.dirty && <span className="dirty-indicator" title="Unsaved changes">●</span>}
              </button>
              <button
                type="button"
                className="card-list-close"
                title="Close"
                onClick={() => handleClose(item).catch((err) => onError(err instanceof Error ? err.message : String(err)))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LorebookList({ onError }: { onError: (message: string) => void }) {
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const activeId = useLorebookStore((s) => s.activeId);
  const store = useLorebookStore.getState();
  return (
    <OpenFileList
      title="Open lorebooks"
      items={lorebooks.map((l) => ({ id: l.id, label: l.book.name || "New lorebook", dirty: l.isDirty }))}
      activeId={activeId}
      onSelect={(id) => store.setActive(id)}
      onClose={(id) => useLorebookStore.getState().close(id)}
      onNew={() => useLorebookStore.getState().newLorebook()}
      onError={onError}
    />
  );
}

function PersonaList({ onError }: { onError: (message: string) => void }) {
  const personas = usePersonaStore((s) => s.characters);
  const activeId = usePersonaStore((s) => s.activeId);
  return (
    <OpenFileList
      title="Open personas"
      items={personas.map((p) => ({ id: p.id, label: p.card.name || "New persona", dirty: p.isDirty, png: p.avatarPng }))}
      activeId={activeId}
      onSelect={(id) => usePersonaStore.getState().setActiveCharacter(id)}
      onClose={(id) => usePersonaStore.getState().closeCharacter(id)}
      onNew={() => usePersonaStore.getState().newCard()}
      onError={onError}
    />
  );
}

function PresetList({ onError }: { onError: (message: string) => void }) {
  const presets = useStPresetStore((s) => s.presets);
  const activeId = useStPresetStore((s) => s.activeId);
  return (
    <OpenFileList
      title="Open presets"
      items={presets.map((p) => ({ id: p.id, label: (p.path.split(/[\\/]/).pop() ?? p.path).replace(/\.json$/i, ""), dirty: p.isDirty }))}
      activeId={activeId}
      onSelect={(id) => useStPresetStore.getState().setActive(id)}
      onClose={(id) => useStPresetStore.getState().close(id)}
      onError={onError}
    />
  );
}

export type AppMode = "characters" | "lorebooks" | "personas" | "presets" | "sillytavern" | "library";

interface Props {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onError: (message: string) => void;
  onHide: () => void;
}

function Thumb({ png }: { png: Uint8Array | null }) {
  const url = useMemo(() => (png ? URL.createObjectURL(new Blob([png], { type: "image/png" })) : null), [png]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url ? <img className="card-list-thumb" src={url} alt="" /> : <div className="card-list-thumb card-list-thumb-empty" />;
}

/** The open characters as a list — replaces the old row of character tabs. */
function OpenCardList({ onError }: { onError: (message: string) => void }) {
  const characters = useCardStore((s) => s.characters);
  const activeId = useCardStore((s) => s.activeId);
  const setActiveCharacter = useCardStore((s) => s.setActiveCharacter);
  const closeCharacter = useCardStore((s) => s.closeCharacter);
  const newCard = useCardStore((s) => s.newCard);

  async function handleClose(id: string, isDirty: boolean) {
    if (isDirty && !(await confirmDiscardChanges())) return;
    closeCharacter(id);
  }

  return (
    <section className="sidebar-section">
      <div className="sidebar-section-head">
        <span>Open cards</span>
        <button type="button" className="secondary sidebar-small-button" title="New card (Ctrl+N)" onClick={() => newCard()}>
          +
        </button>
      </div>
      {characters.length === 0 ? (
        <p className="field-hint sidebar-hint">No card open.</p>
      ) : (
        <ul className="card-list">
          {characters.map((c) => (
            <li key={c.id} className={c.id === activeId ? "card-list-item active" : "card-list-item"}>
              <button type="button" className="card-list-select" onClick={() => setActiveCharacter(c.id)}>
                <Thumb png={c.avatarPng} />
                <span className="card-list-name">{c.card.name || "New card"}</span>
                {c.isDirty && <span className="dirty-indicator" title="Unsaved changes">●</span>}
              </button>
              <button
                type="button"
                className="card-list-close"
                title="Close card"
                onClick={() => handleClose(c.id, c.isDirty).catch((err) => onError(err instanceof Error ? err.message : String(err)))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Left column: which part of the app (characters, lorebooks, …) and, for characters, the open cards.
 * The SillyTavern list and the library get their place here later. */
export function LeftSidebar({ mode, onModeChange, onError, onHide }: Props) {
  const anyLorebookDirty = useLorebookStore((s) => s.lorebooks.some((l) => l.isDirty));
  const anyPersonaDirty = usePersonaStore((s) => s.characters.some((c) => c.isDirty));
  const anyPresetDirty = useStPresetStore((s) => s.presets.some((p) => p.isDirty));
  const anyCardDirty = useCardStore((s) => s.characters.some((c) => c.isDirty));

  const modes: { id: AppMode; label: string; dirty: boolean }[] = [
    { id: "characters", label: "Characters", dirty: anyCardDirty },
    { id: "lorebooks", label: "Lorebooks", dirty: anyLorebookDirty },
    { id: "personas", label: "Personas", dirty: anyPersonaDirty },
    { id: "presets", label: "Presets", dirty: anyPresetDirty },
    { id: "library", label: "Library", dirty: false },
    { id: "sillytavern", label: "SillyTavern", dirty: false },
  ];

  return (
    <>
      <div className="sidebar-head">
        <nav className="mode-list">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? "mode-list-button active" : "mode-list-button"}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
              {m.dirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
            </button>
          ))}
        </nav>
        <button type="button" className="secondary sidebar-small-button sidebar-hide" title="Hide the sidebar" onClick={onHide}>
          ‹
        </button>
      </div>
      <div className="sidebar-body">
        {mode === "characters" && <OpenCardList onError={onError} />}
        {mode === "lorebooks" && <LorebookList onError={onError} />}
        {mode === "personas" && <PersonaList onError={onError} />}
        {mode === "presets" && <PresetList onError={onError} />}
      </div>
    </>
  );
}
