import { AiTextarea } from "./AiTextarea";

interface ListEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  getItemWarning?: (item: string, index: number) => string | undefined;
  /** AI quick actions above each multi-line item; the label names the field in the request. */
  aiLabel?: string;
}

/** Editable list of strings (alternate greetings, tags, lorebook keys, ...) with add/remove and
 * reorder. Kept intentionally simple — up/down buttons instead of drag & drop, since that's
 * enough for the handful of entries these lists realistically hold. */
export function ListEditor({ label, items, onChange, placeholder, multiline, getItemWarning, aiLabel }: ListEditorProps) {
  function update(index: number, value: string) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function add() {
    onChange([...items, ""]);
  }

  const InputTag = multiline ? "textarea" : "input";

  return (
    <div className="list-editor">
      <div className="field-label">{label}</div>
      {items.length === 0 && <p className="list-editor-empty">No entries yet.</p>}
      {items.map((item, index) => {
        const warning = getItemWarning?.(item, index);
        return (
          <div className="list-editor-row-group" key={index}>
            <div className="list-editor-row">
              {multiline && aiLabel ? (
                <div className="list-editor-ai-item">
                  <AiTextarea
                    value={item}
                    placeholder={placeholder}
                    rows={3}
                    onChange={(value) => update(index, value)}
                    ai={{ label: `${aiLabel} ${index + 1}` }}
                  />
                </div>
              ) : (
                <InputTag
                  className={multiline ? "field-textarea" : "field-input"}
                  value={item}
                  placeholder={placeholder}
                  rows={multiline ? 3 : undefined}
                  onChange={(e) => update(index, e.target.value)}
                />
              )}
              <div className="list-editor-actions">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Move up">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button type="button" onClick={() => remove(index)} title="Remove" className="danger">
                  ✕
                </button>
              </div>
            </div>
            {warning && <span className="field-warning">⚠ {warning}</span>}
          </div>
        );
      })}
      <button type="button" className="secondary" onClick={add}>
        + Add
      </button>
    </div>
  );
}
