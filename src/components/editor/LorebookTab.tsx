import { useState } from "react";
import { confirmAction } from "../../io/confirmDiscard";
import { exportLorebook, importLorebook } from "../../io/lorebookIO";
import type { LorebookEntry } from "../../schema/lorebook";
import { AiLorebookAssistPanel } from "./AiLorebookAssistPanel";
import { LorebookEntryEditor } from "./LorebookEntryEditor";
import type { TabProps } from "./types";

function blankEntry(): LorebookEntry {
  return { keys: [], content: "", extensions: {}, enabled: true, insertion_order: 0 };
}

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
            book={book ?? undefined}
            onChange={(merged) => onChange({ character_book: merged })}
            onClose={() => setIsAiAssistOpen(false)}
          />
        )}
      </div>
    );
  }

  function updateEntry(index: number, patch: Partial<LorebookEntry>) {
    const entries = [...book!.entries];
    entries[index] = { ...entries[index], ...patch };
    onChange({ character_book: { ...book!, entries } });
  }

  function removeEntry(index: number) {
    onChange({ character_book: { ...book!, entries: book!.entries.filter((_, i) => i !== index) } });
  }

  function addEntry() {
    onChange({ character_book: { ...book!, entries: [...book!.entries, blankEntry()] } });
  }

  return (
    <div className="tab-panel">
      <div className="field-row">
        <label className="field">
          <span className="field-label">Lorebook name</span>
          <input
            className="field-input"
            type="text"
            value={book.name ?? ""}
            onChange={(e) => onChange({ character_book: { ...book, name: e.target.value } })}
          />
        </label>
        <button type="button" className="secondary" onClick={handleExport}>
          Export…
        </button>
        <button type="button" className="secondary" onClick={handleImport}>
          Import…
        </button>
        <button type="button" className="secondary" onClick={() => setIsAiAssistOpen(true)}>
          Suggest entries with AI…
        </button>
        <button
          type="button"
          className="danger secondary"
          onClick={() => onChange({ character_book: undefined })}
        >
          Remove lorebook
        </button>
      </div>

      {book.entries.length === 0 && <p>No entries yet.</p>}
      {book.entries.map((entry, index) => (
        <LorebookEntryEditor
          key={index}
          entry={entry}
          onChange={(patch) => updateEntry(index, patch)}
          onRemove={() => removeEntry(index)}
        />
      ))}

      <button type="button" className="secondary" onClick={addEntry}>
        + Add entry
      </button>

      {isAiAssistOpen && (
        <AiLorebookAssistPanel
          book={book}
          onChange={(merged) => onChange({ character_book: merged })}
          onClose={() => setIsAiAssistOpen(false)}
        />
      )}
    </div>
  );
}
