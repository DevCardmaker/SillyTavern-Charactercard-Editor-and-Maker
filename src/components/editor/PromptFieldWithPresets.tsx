import { useEffect, useState } from "react";
import type { PromptPresetField } from "../../io/promptPresets";
import { usePromptPresetsStore } from "../../state/promptPresetsStore";
import { TextAreaField } from "../common/FormField";

interface Props {
  field: PromptPresetField;
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: string;
  warning?: string;
}

/** A prompt-style textarea plus its preset controls: apply a saved preset, save the current text
 * as a new one, delete old ones, and a one-step undo after applying (cleared by editing the
 * field further or navigating away — no clipboard/tempfile side effects). */
export function PromptFieldWithPresets({ field, label, value, onChange, hint, warning }: Props) {
  const presets = usePromptPresetsStore((s) => s.presets);
  const ensureLoaded = usePromptPresetsStore((s) => s.ensureLoaded);
  const addPreset = usePromptPresetsStore((s) => s.addPreset);
  const removePreset = usePromptPresetsStore((s) => s.removePreset);

  const [undoText, setUndoText] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null); // null = "save as" form closed

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const fieldPresets = presets?.[field] ?? [];

  function handleFieldChange(next: string) {
    setUndoText(null);
    onChange(next);
  }

  function applyPreset(id: string) {
    const preset = fieldPresets.find((p) => p.id === id);
    if (!preset) return;
    setUndoText(value);
    onChange(preset.text);
  }

  function undo() {
    if (undoText === null) return;
    onChange(undoText);
    setUndoText(null);
  }

  function confirmSaveAsPreset() {
    const label = newLabel?.trim();
    if (!label) return;
    addPreset(field, label, value);
    setNewLabel(null);
  }

  return (
    <div className="prompt-field-with-presets">
      <TextAreaField label={label} value={value} onChange={handleFieldChange} rows={6} hint={hint} warning={warning} />

      {undoText !== null && (
        <p className="preset-undo-hint">
          Preset applied —{" "}
          <button type="button" className="link-button" onClick={undo}>
            Undo
          </button>
        </p>
      )}

      <div className="preset-bar">
        <select
          className="field-input"
          value=""
          onChange={(e) => e.target.value && applyPreset(e.target.value)}
          disabled={fieldPresets.length === 0}
        >
          <option value="">— Load preset —</option>
          {fieldPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {newLabel === null ? (
          <button type="button" className="secondary" onClick={() => setNewLabel("")}>
            Save as preset…
          </button>
        ) : (
          <>
            <input
              className="field-input"
              type="text"
              placeholder="Label…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              autoFocus
            />
            <button type="button" onClick={confirmSaveAsPreset} disabled={!newLabel.trim()}>
              Save
            </button>
            <button type="button" className="secondary" onClick={() => setNewLabel(null)}>
              Cancel
            </button>
          </>
        )}
      </div>

      {fieldPresets.length > 0 && (
        <details className="preset-manage">
          <summary>Manage presets ({fieldPresets.length})</summary>
          {fieldPresets.map((p) => (
            <div key={p.id} className="preset-manage-row">
              <span>{p.label}</span>
              <button
                type="button"
                className="danger"
                onClick={() => removePreset(field, p.id)}
                title="Delete preset"
              >
                ✕
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
