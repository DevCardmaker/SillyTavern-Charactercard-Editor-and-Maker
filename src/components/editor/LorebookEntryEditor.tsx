import { useState } from "react";
import type { LorebookEntry } from "../../schema/lorebook";
import { combineWarnings, lorebookEntryMissingKeysWarning, unbalancedMacroWarning } from "../../schema/warnings";
import { ListEditor } from "../common/ListEditor";
import { TextAreaField } from "../common/FormField";

interface Props {
  entry: LorebookEntry;
  /** Only the initial state — the user can still expand/collapse freely afterwards. */
  defaultOpen?: boolean;
  onChange: (patch: Partial<LorebookEntry>) => void;
  onRemove: () => void;
  /** Keys this entry shares with other entries (lowercased), if any. */
  sharedKeys?: string[];
}

export function LorebookEntryEditor({ entry, defaultOpen = true, onChange, onRemove, sharedKeys }: Props) {
  const keysWarning = combineWarnings(
    lorebookEntryMissingKeysWarning(entry),
    sharedKeys && `Also a key of another entry: ${sharedKeys.map((k) => `“${k}”`).join(", ")}`,
  );
  // Uncontrolled on purpose: a controlled `open` would snap back on every keystroke re-render.
  const [initiallyOpen] = useState(defaultOpen);

  return (
    <details className="lorebook-entry" open={initiallyOpen}>
      <summary>
        {entry.comment || entry.keys.join(", ") || "(new entry)"}
        {sharedKeys && (
          <span className="field-warning" title={`Shared keys: ${sharedKeys.join(", ")}`}>
            {" "}⚠
          </span>
        )}
        <button type="button" className="danger" onClick={onRemove} title="Remove entry">
          ✕
        </button>
      </summary>

      <div className="lorebook-entry-body">
        <label className="field-inline">
          <input type="checkbox" checked={entry.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          Enabled
        </label>

        <ListEditor label="Keywords (Keys)" items={entry.keys} onChange={(keys) => onChange({ keys })} />
        {keysWarning && <span className="field-warning">⚠ {keysWarning}</span>}

        <TextAreaField
          label="Content"
          value={entry.content}
          onChange={(content) => onChange({ content })}
          rows={5}
          warning={unbalancedMacroWarning(entry.content)}
        />

        <div className="field-row">
          <label className="field">
            <span className="field-label">Comment (internal only)</span>
            <input
              className="field-input"
              type="text"
              value={entry.comment ?? ""}
              onChange={(e) => onChange({ comment: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Insertion order</span>
            <input
              className="field-input"
              type="number"
              value={entry.insertion_order}
              onChange={(e) => onChange({ insertion_order: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field-inline">
            <input
              type="checkbox"
              checked={entry.constant ?? false}
              onChange={(e) => onChange({ constant: e.target.checked })}
            />
            Always active (constant)
          </label>
          <label className="field-inline">
            <input
              type="checkbox"
              checked={entry.case_sensitive ?? false}
              onChange={(e) => onChange({ case_sensitive: e.target.checked })}
            />
            Case-sensitive
          </label>
          <label className="field-inline">
            <input
              type="checkbox"
              checked={entry.selective ?? false}
              onChange={(e) => onChange({ selective: e.target.checked })}
            />
            Selective (requires secondary keys)
          </label>
        </div>

        {entry.selective && (
          <ListEditor
            label="Additional keywords (Secondary Keys)"
            items={entry.secondary_keys ?? []}
            onChange={(secondary_keys) => onChange({ secondary_keys })}
          />
        )}

        <label className="field">
          <span className="field-label">Position</span>
          <select
            className="field-input"
            value={entry.position ?? "before_char"}
            onChange={(e) => onChange({ position: e.target.value as LorebookEntry["position"] })}
          >
            <option value="before_char">Before character description</option>
            <option value="after_char">After character description</option>
          </select>
        </label>
      </div>
    </details>
  );
}
