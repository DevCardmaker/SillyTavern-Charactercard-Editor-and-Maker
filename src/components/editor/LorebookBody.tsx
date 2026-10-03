import { type ReactNode, useMemo, useState } from "react";
import type { Lorebook, LorebookEntry } from "../../schema/lorebook";
import { pickMergeSource } from "../../io/lorebookIO";
import { duplicateKeys } from "../../schema/lorebookKeyTest";
import { mergeLorebook } from "../../schema/mergeLorebook";
import { entryMatches } from "../../schema/sharedLorebook";
import { AiLorebookAssistPanel } from "./AiLorebookAssistPanel";
import { AiLorebookEditPanel } from "./AiLorebookEditPanel";
import { LorebookEntryEditor } from "./LorebookEntryEditor";
import { LorebookKeyTestPanel } from "./LorebookKeyTestPanel";

interface Props {
  book: Lorebook;
  onChange: (book: Lorebook) => void;
  /** Context-specific buttons (Export/Import/Remove for a card's lorebook) next to the AI ones. */
  actions?: ReactNode;
  /** Shown above everything else, e.g. the "linked to a shared lorebook" hint on a card. */
  notice?: ReactNode;
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
export function LorebookBody({ book, onChange, actions, notice }: Props) {
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isKeyTestOpen, setIsKeyTestOpen] = useState(false);
  const [mergeMessage, setMergeMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const dupes = useMemo(() => duplicateKeys(book), [book]);
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
    // A blank entry would never match the filter — clear it so the new entry is actually visible.
    setQuery("");
    onChange({ ...book, entries: [...book.entries, blankEntry()] });
  }

  // Filters the display only: every entry keeps its real index, which updateEntry/removeEntry
  // (and the AI panels' write-back) rely on.
  const visible = book.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entryMatches(entry, query));
  const isFiltering = query.trim() !== "";
  const expandAll = visible.length <= EXPAND_ALL_UP_TO;

  /** Appends another lorebook's entries (a lorebook file or a card's embedded one), skipping exact
   * duplicates. This lorebook's name, description and settings stay as they are. */
  async function handleMerge() {
    setMergeMessage(null);
    try {
      const source = await pickMergeSource();
      if (!source) return;
      const { book: merged, added, skipped } = mergeLorebook(book, source.book);
      if (added > 0) onChange(merged);
      const dupes = skipped > 0 ? ` (${skipped} already here, skipped)` : "";
      setMergeMessage({ text: `Added ${added} entries from “${source.fileName}”${dupes}.`, isError: false });
    } catch (err) {
      setMergeMessage({ text: err instanceof Error ? err.message : String(err), isError: true });
    }
  }

  return (
    <div className="tab-panel">
      {notice}
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
        <button
          type="button"
          className="secondary"
          onClick={handleMerge}
          title="Add the entries of another lorebook file or of a character card's lorebook to this one"
        >
          Merge lorebook…
        </button>
        <button
          type="button"
          className="secondary"
          disabled={book.entries.length === 0}
          onClick={() => setIsKeyTestOpen(true)}
          title="Paste chat text and see which entries SillyTavern would insert"
        >
          Test keys…
        </button>
        <span className="field-hint">
          {isFiltering ? `${visible.length} of ${book.entries.length} entries` : `${book.entries.length} entries`}
        </span>
      </div>

      {mergeMessage && <p className={mergeMessage.isError ? "field-error" : "field-hint"}>{mergeMessage.text}</p>}

      {book.entries.length > 0 && (
        <input
          className="field-input lorebook-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search label, keys and content…"
        />
      )}

      {book.entries.length === 0 && <p>No entries yet.</p>}
      {isFiltering && visible.length === 0 && <p>No entries match “{query.trim()}”.</p>}
      {visible.map(({ entry, index }) => (
        <LorebookEntryEditor
          key={index}
          entry={entry}
          defaultOpen={expandAll || entry.content.trim() === ""}
          sharedKeys={dupes.get(index)}
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
      {isKeyTestOpen && <LorebookKeyTestPanel book={book} onClose={() => setIsKeyTestOpen(false)} />}
      {isAiEditOpen && <AiLorebookEditPanel book={book} onChange={onChange} onClose={() => setIsAiEditOpen(false)} />}
    </div>
  );
}
