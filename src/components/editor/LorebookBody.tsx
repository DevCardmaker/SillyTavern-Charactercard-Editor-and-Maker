import { type ReactNode, useState } from "react";
import type { Lorebook, LorebookEntry } from "../../schema/lorebook";
import { AiLorebookAssistPanel } from "./AiLorebookAssistPanel";
import { AiLorebookEditPanel } from "./AiLorebookEditPanel";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface Props {
  book: Lorebook;
  onChange: (book: Lorebook) => void;
  /** Context-specific buttons (Export/Import/Remove for a card's lorebook) next to the AI ones. */
  actions?: ReactNode;
}

/** Above this many entries, entries start collapsed — downloaded lorebooks can have hundreds,
 * and a wall of fully expanded editors is unusable. Empty entries always start expanded. */
const EXPAND_ALL_UP_TO = 20;

function blankEntry(): LorebookEntry {
  return { keys: [], content: "", extensions: {}, enabled: true, insertion_order: 0 };
}

/** The lorebook editor itself (name, description, entries, AI helpers) — shared by a card's
 * Lorebook tab and the standalone Lorebooks workspace, which differ only in where the book lives
 * and which file actions surround it. */
export function LorebookBody({ book, onChange, actions }: Props) {
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);
  const [isAiEditOpen, setIsAiEditOpen] = useState(false);

  function updateEntry(index: number, patch: Partial<LorebookEntry>) {
    const entries = [...book.entries];
    entries[index] = { ...entries[index], ...patch };
    onChange({ ...book, entries });
  }

  function removeEntry(index: number) {
    onChange({ ...book, entries: book.entries.filter((_, i) => i !== index) });
  }

  function addEntry() {
    onChange({ ...book, entries: [...book.entries, blankEntry()] });
  }

  const expandAll = book.entries.length <= EXPAND_ALL_UP_TO;

  return (
    <div className="tab-panel">
      <div className="field-row">
        <label className="field">
          <span className="field-label">Lorebook name</span>
          <input
            className="field-input"
            type="text"
            value={book.name ?? ""}
            onChange={(e) => onChange({ ...book, name: e.target.value })}
          />
        </label>
        {actions}
      </div>

      <label className="field">
        <span className="field-label">Description (internal only)</span>
        <textarea
          className="field-textarea"
          rows={2}
          value={book.description ?? ""}
          onChange={(e) => onChange({ ...book, description: e.target.value })}
        />
      </label>

      <div className="field-row">
        <button type="button" className="secondary" onClick={() => setIsAiAssistOpen(true)}>
          Suggest entries with AI…
        </button>
        <button
          type="button"
          className="secondary"
          disabled={book.entries.length === 0}
          onClick={() => setIsAiEditOpen(true)}
        >
          Fill / revise entries with AI…
        </button>
        <span className="field-hint">{book.entries.length} entries</span>
      </div>

      {book.entries.length === 0 && <p>No entries yet.</p>}
      {book.entries.map((entry, index) => (
        <LorebookEntryEditor
          key={index}
          entry={entry}
          defaultOpen={expandAll || entry.content.trim() === ""}
          onChange={(patch) => updateEntry(index, patch)}
          onRemove={() => removeEntry(index)}
        />
      ))}

      <button type="button" className="secondary" onClick={addEntry}>
        + Add entry
      </button>

      {isAiAssistOpen && (
        <AiLorebookAssistPanel book={book} onChange={onChange} onClose={() => setIsAiAssistOpen(false)} />
      )}
      {isAiEditOpen && <AiLorebookEditPanel book={book} onChange={onChange} onClose={() => setIsAiEditOpen(false)} />}
    </div>
  );
}
