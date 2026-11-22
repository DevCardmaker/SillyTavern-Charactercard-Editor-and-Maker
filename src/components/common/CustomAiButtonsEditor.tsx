import { useEffect, useState } from "react";
import type { CustomAiButton } from "../../io/customAiButtons";
import { useCustomAiButtonsStore } from "../../state/customAiButtonsStore";

/** Add, change and remove your own quick actions: a button label and the instruction it sends. They
 * appear under "More" above every text field. A page of the settings. */
export function CustomAiButtonsEditor() {
  const stored = useCustomAiButtonsStore((s) => s.buttons);
  const ensureLoaded = useCustomAiButtonsStore((s) => s.ensureLoaded);
  const save = useCustomAiButtonsStore((s) => s.save);
  const [draft, setDraft] = useState<CustomAiButton[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);
  useEffect(() => {
    if (stored && !draft) setDraft(stored.map((b) => ({ ...b })));
  }, [stored, draft]);

  function update(index: number, patch: Partial<CustomAiButton>) {
    setSaved(false);
    setDirty(true);
    setDraft((d) => d && d.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  // Saved shortly after each change, like every other setting — closing the window loses nothing.
  // Empty rows stay in the list here but aren't written to the file.
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = setTimeout(() => {
      save(draft)
        .then(() => setSaved(true))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, dirty, save]);


  return (
    <div className="settings-section">
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
              onClick={() => {
                setSaved(false);
                setDirty(true);
                setDraft((d) => d && d.filter((_, j) => j !== i));
              }}
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
        <p className="field-hint">{saved ? "Saved." : "Saved automatically. Buttons without a label or instruction are left out."}</p>
    </div>
  );
}
