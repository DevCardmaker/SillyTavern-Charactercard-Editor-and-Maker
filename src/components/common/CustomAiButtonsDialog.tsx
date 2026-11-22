import { useEffect, useState } from "react";
import type { CustomAiButton } from "../../io/customAiButtons";
import { useCustomAiButtonsStore } from "../../state/customAiButtonsStore";

/** Add, change and remove your own quick actions: a button label and the instruction it sends. They
 * appear under "More" above every text field. */
export function CustomAiButtonsDialog({ onClose }: { onClose: () => void }) {
  const stored = useCustomAiButtonsStore((s) => s.buttons);
  const ensureLoaded = useCustomAiButtonsStore((s) => s.ensureLoaded);
  const save = useCustomAiButtonsStore((s) => s.save);
  const [draft, setDraft] = useState<CustomAiButton[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);
  useEffect(() => {
    if (stored && !draft) setDraft(stored.map((b) => ({ ...b })));
  }, [stored, draft]);

  function update(index: number, patch: Partial<CustomAiButton>) {
    setDraft((d) => d && d.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  async function handleSave() {
    if (!draft) return;
    try {
      await save(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>My quick actions</h3>
        <p className="field-hint">
          Each button sends its instruction together with the text (or the selected part) and shows the result for review.
          They appear under “More” above every text field. Example: “Rewrite as dialogue in {"{{char}}"}'s voice.”
        </p>
        {draft?.length === 0 && <p className="field-hint">No buttons yet.</p>}
        {draft?.map((button, i) => (
          <div key={button.id} className="custom-button-row">
            <input
              type="text"
              placeholder="Button label"
              value={button.label}
              maxLength={30}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <textarea
              className="field-textarea"
              rows={2}
              placeholder="Instruction for the AI"
              value={button.instruction}
              onChange={(e) => update(i, { instruction: e.target.value })}
            />
            <button
              type="button"
              className="secondary"
              title="Remove this button"
              onClick={() => setDraft((d) => d && d.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setDraft((d) => [...(d ?? []), { id: `button-${Date.now()}`, label: "", instruction: "" }])
            }
          >
            + Add button
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <span className="field-hint">Buttons without a label or instruction are left out.</span>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!draft}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
