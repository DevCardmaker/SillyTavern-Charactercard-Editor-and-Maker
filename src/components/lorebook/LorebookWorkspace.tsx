import { useEffect, useState } from "react";
import { confirmDiscardChanges } from "../../io/confirmDiscard";
import { openLorebookFiles, saveActiveLorebook } from "../../io/lorebookIO";
import { shareStatus } from "../../schema/sharedLorebook";
import { useCardStore } from "../../state/cardStore";
import { useLorebookStore } from "../../state/lorebookStore";
import { LorebookBody } from "../editor/LorebookBody";
import { ShareLorebookPanel } from "./ShareLorebookPanel";

interface Props {
  onError: (message: string) => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The "Lorebooks" mode: standalone World Info files, independent of any character card. Same
 * shape as the Characters mode (toolbar → tab strip → editor), reusing the card's lorebook editor
 * (`LorebookBody`) for the actual editing. Saves always go out in SillyTavern's World Info format,
 * so files can be imported straight into ST's World Info panel. */
export function LorebookWorkspace({ onError }: Props) {
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const activeId = useLorebookStore((s) => s.activeId);
  const newLorebook = useLorebookStore((s) => s.newLorebook);
  const updateActive = useLorebookStore((s) => s.updateActive);
  const setActive = useLorebookStore((s) => s.setActive);
  const close = useLorebookStore((s) => s.close);

  const active = lorebooks.find((l) => l.id === activeId) ?? null;
  const characters = useCardStore((s) => s.characters);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const hasName = !!active?.book.name?.trim();
  const statuses = active ? characters.map((c) => ({ c, status: shareStatus(c.card, active.book) })) : [];
  const linked = statuses.filter(({ status }) => status === "synced" || status === "outdated").map(({ c }) => c);
  const outdated = statuses.filter(({ status }) => status === "outdated").length;

  async function handleOpen() {
    try {
      const failed = await openLorebookFiles();
      if (failed.length > 0) onError(failed.join(" — "));
    } catch (err) {
      onError(describe(err));
    }
  }

  async function handleSave(mode: "save" | "saveAs") {
    try {
      await saveActiveLorebook(mode);
    } catch (err) {
      onError(describe(err));
    }
  }

  async function handleClose(id: string, isDirty: boolean) {
    try {
      if (isDirty && !(await confirmDiscardChanges())) return;
      close(id);
    } catch (err) {
      onError(describe(err));
    }
  }

  // Ctrl+N/O/S act on lorebooks while this mode is shown — the Characters toolbar (which binds the
  // same keys for cards) isn't mounted then, so there's no double handling.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        useLorebookStore.getState().newLorebook();
      } else if (key === "o") {
        e.preventDefault();
        handleOpen();
      } else if (key === "s") {
        e.preventDefault();
        handleSave("save");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileName = active?.currentFilePath ? active.currentFilePath.split(/[\\/]/).pop() : "New lorebook";

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={newLorebook} title="Ctrl+N">
          New
        </button>
        <button type="button" onClick={handleOpen} title="Ctrl+O — several files at once open as separate tabs">
          Open…
        </button>
        <button type="button" onClick={() => handleSave("save")} disabled={!active} title="Ctrl+S">
          Save
        </button>
        <button type="button" className="secondary" onClick={() => handleSave("saveAs")} disabled={!active}>
          Save As…
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setIsShareOpen(true)}
          disabled={!active || !hasName}
          title={
            hasName
              ? "Embed this lorebook into open character cards and link them to it, so they stay in sync"
              : "Give the lorebook a name first — cards are linked to it by name"
          }
        >
          Sync to characters…
        </button>
        {linked.length > 0 && (
          <span className="field-hint" title={linked.map((c) => c.card.name || "New card").join(", ")}>
            Shared with {linked.length} open card(s){outdated > 0 && `, ${outdated} out of date`}
          </span>
        )}
        {active && (
          <div className="toolbar-title">
            {fileName}
            {active.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </div>
        )}
      </div>

      {lorebooks.length > 0 && (
        <div className="character-tab-bar">
          {lorebooks.map((l) => (
            <div key={l.id} className={l.id === activeId ? "character-tab active" : "character-tab"}>
              <button type="button" className="character-tab-select" onClick={() => setActive(l.id)}>
                {l.book.name || "New lorebook"}
                {l.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
              </button>
              <button
                type="button"
                className="character-tab-close"
                title="Close tab"
                onClick={() => handleClose(l.id, l.isDirty)}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="character-tab-add" title="New lorebook as a tab" onClick={newLorebook}>
            +
          </button>
        </div>
      )}

      {!active ? (
        <div className="empty-state">
          <p>
            No lorebook open. Create a new one or open a World Info file (.json) — both SillyTavern exports and
            Chub downloads work.
          </p>
        </div>
      ) : (
        <div className="editor-main lorebook-workspace">
          <LorebookBody key={active.id} book={active.book} onChange={updateActive} />
        </div>
      )}

      {isShareOpen && active && <ShareLorebookPanel book={active.book} onClose={() => setIsShareOpen(false)} />}
    </>
  );
}
