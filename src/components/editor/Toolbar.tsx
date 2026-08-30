import { useEffect, useState } from "react";
import { useTotalTokenCount } from "../../hooks/useTokenCount";
import { openCardFile, openFolderAsTabs, saveCard, saveCardAsCopy } from "../../io/fileIO";
import { useCardStore } from "../../state/cardStore";
import { AiGroupGeneratePanel } from "./AiGroupGeneratePanel";

interface Props {
  onError: (message: string) => void;
  onOpenAiAssist: () => void;
}

export function Toolbar({ onError, onOpenAiAssist }: Props) {
  const card = useCardStore((s) => s.card);
  const isDirty = useCardStore((s) => s.isDirty);
  const currentFilePath = useCardStore((s) => s.currentFilePath);
  const newCard = useCardStore((s) => s.newCard);
  const totalTokenCount = useTotalTokenCount(card);
  const [isGroupGenerateOpen, setIsGroupGenerateOpen] = useState(false);

  function handleOpenAiAssist() {
    if (!card) newCard();
    onOpenAiAssist();
  }

  // New/Open/Open Folder always add a new tab rather than replacing the active one, so unlike
  // Save there's nothing here that could discard unsaved work — no confirm needed.
  function handleNew() {
    newCard();
  }

  async function handleOpen() {
    try {
      await openCardFile();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function handleOpenFolder() {
    try {
      const { opened, failed } = await openFolderAsTabs();
      if (failed.length > 0) {
        onError(
          `${opened} card(s) loaded from the folder, ${failed.length} skipped (not a valid character card): ` +
            failed.join(", "),
        );
      }
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function handleSave() {
    try {
      await saveCard("save");
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function handleSaveAs() {
    try {
      await saveCard("saveAs");
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function handleSaveAsCopy() {
    try {
      await saveCardAsCopy();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  // Strg+N/Strg+O/Strg+S. None of the three close over component state that changes across
  // renders (they all go through the store/fileIO module directly), so the listener never goes
  // stale and only needs to be attached once.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleNew();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        handleOpen();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "New card";

  return (
    <div className="toolbar">
      <button type="button" onClick={handleNew} title="Ctrl+N">
        New
      </button>
      <button type="button" onClick={handleOpen} title="Ctrl+O">
        Open…
      </button>
      <button
        type="button"
        className="secondary"
        onClick={handleOpenFolder}
        title="Open every .png/.json card from a folder, each as its own tab"
      >
        Open Folder…
      </button>
      <button type="button" onClick={handleSave} disabled={!card} title="Ctrl+S">
        Save
      </button>
      <button type="button" className="secondary" onClick={handleSaveAs} disabled={!card}>
        Save As…
      </button>
      <button
        type="button"
        className="secondary"
        onClick={handleSaveAsCopy}
        disabled={!card}
        title="Additionally export the current state elsewhere, without switching the currently open file"
      >
        Save as Copy…
      </button>
      <button type="button" className="secondary" onClick={handleOpenAiAssist}>
        AI Assistant…
      </button>
      <button type="button" className="secondary" onClick={() => setIsGroupGenerateOpen(true)}>
        Create Group…
      </button>
      {isGroupGenerateOpen && <AiGroupGeneratePanel onClose={() => setIsGroupGenerateOpen(false)} />}
      <div className="toolbar-title">
        {fileName}
        {isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
        {card && totalTokenCount !== null && (
          <span
            className="total-token-count"
            title="Sum of description, personality, scenario, first message, example dialogue"
          >
            {" "}
            · {totalTokenCount} tokens total
          </span>
        )}
      </div>
    </div>
  );
}
