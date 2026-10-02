import { useState } from "react";
import { confirmAction } from "../../io/confirmDiscard";
import { exportLorebook, importLorebook } from "../../io/lorebookIO";
import { AiLorebookAssistPanel } from "./AiLorebookAssistPanel";
import { LorebookBody } from "./LorebookBody";
import type { TabProps } from "./types";

export function LorebookTab({ card, onChange, onError }: TabProps) {
  const book = card.character_book;
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);

  async function handleImport() {
    try {
      if (book && book.entries.length > 0) {
        const proceed = await confirmAction(
          "This card already has a lorebook with entries. Importing will replace it completely. Continue?",
          "Replace lorebook?",
        );
        if (!proceed) return;
      }
      const imported = await importLorebook();
      if (imported) onChange({ character_book: imported });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport() {
    if (!book) return;
    try {
      await exportLorebook(book);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!book) {
    return (
      <div className="tab-panel">
        <p>This card doesn't have a lorebook yet.</p>
        <div className="field-row">
          <button
            type="button"
            onClick={() => onChange({ character_book: { entries: [], extensions: {} } })}
          >
            Enable lorebook
          </button>
          <button type="button" className="secondary" onClick={handleImport}>
            Import lorebook…
          </button>
          <button type="button" className="secondary" onClick={() => setIsAiAssistOpen(true)}>
            Suggest entries with AI…
          </button>
        </div>
        {isAiAssistOpen && (
          <AiLorebookAssistPanel
            book={undefined}
            onChange={(merged) => onChange({ character_book: merged })}
            onClose={() => setIsAiAssistOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <LorebookBody
      book={book}
      onChange={(next) => onChange({ character_book: next })}
      actions={
        <>
          <button type="button" className="secondary" onClick={handleExport}>
            Export…
          </button>
          <button type="button" className="secondary" onClick={handleImport}>
            Import…
          </button>
          <button
            type="button"
            className="danger secondary"
            onClick={() => onChange({ character_book: undefined })}
          >
            Remove lorebook
          </button>
        </>
      }
    />
  );
}
