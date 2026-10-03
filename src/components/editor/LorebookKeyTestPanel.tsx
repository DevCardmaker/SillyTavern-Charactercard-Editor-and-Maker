import { useMemo, useState } from "react";
import type { Lorebook } from "../../schema/lorebook";
import { type Activation, DEFAULT_KEY_TEST_SETTINGS, type KeyTestSettings, testKeys } from "../../schema/lorebookKeyTest";

interface Props {
  book: Lorebook;
  onClose: () => void;
}

/** Paste some chat text, see which entries SillyTavern would activate — and why. Results update
 * live while typing; nothing here changes the lorebook. */
export function LorebookKeyTestPanel({ book, onClose }: Props) {
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<KeyTestSettings>(DEFAULT_KEY_TEST_SETTINGS);

  const result = useMemo(() => testKeys(book, text, settings), [book, text, settings]);
  const label = (index: number) => {
    const entry = book.entries[index];
    return entry.comment || entry.keys.join(", ") || `Entry ${index + 1}`;
  };

  function reason(a: Activation): string {
    if (a.reason === "constant") return "always active";
    if (a.reason === "key") return `key “${a.key}”`;
    return `via recursion from “${label(a.via)}” (key “${a.key}”)`;
  }

  function toggle(key: keyof KeyTestSettings) {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }

  const keyHits = result.activations.filter((a) => a.reason !== "constant").length;

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Test keys</h3>
        <p className="field-hint">
          Paste a few chat messages. SillyTavern only scans the most recent ones (your scan depth is 2 messages), so
          test with text of about that length.
        </p>

        <textarea
          className="field-textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “I ask Mara about her mother and the old lighthouse.”"
          autoFocus
        />

        <div className="ai-assist-field-checkboxes">
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={settings.matchWholeWords} onChange={() => toggle("matchWholeWords")} />
            Match whole words
          </label>
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={settings.caseSensitive} onChange={() => toggle("caseSensitive")} />
            Case-sensitive
          </label>
          <label className="ai-assist-field-checkbox">
            <input type="checkbox" checked={settings.recursive} onChange={() => toggle("recursive")} />
            Recursive scan
          </label>
        </div>
        <p className="field-hint">
          Defaults match your SillyTavern's World Info settings. Entries with their own setting override these.
        </p>

        {text.trim() !== "" && (
          <div className="key-test-results">
            <span className="field-label">
              {result.activations.length} of {book.entries.length} entries would be inserted
              {keyHits !== result.activations.length && ` (${keyHits} triggered by this text)`}
            </span>
            {result.activations.length === 0 && <p>No entry triggered.</p>}
            {result.activations.map((a) => (
              <div key={a.index} className={`key-test-hit key-test-${a.reason}`}>
                <strong>{label(a.index)}</strong>
                <span className="field-hint">
                  {reason(a)}
                  {result.probabilities.has(a.index) && ` · only ${result.probabilities.get(a.index)}% chance`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
