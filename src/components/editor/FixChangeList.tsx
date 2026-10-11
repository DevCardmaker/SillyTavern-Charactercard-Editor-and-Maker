import { applySnippet, CONSISTENCY_FIX_FIELD_LABELS, type ResolvedFixChange } from "../../schema/aiConsistencyFix";
import type { NormalizedCard } from "../../schema/normalize";
import { useCardStore } from "../../state/cardStore";

export type ReviewableChange = ResolvedFixChange & { enabled: boolean };

/** Applies the ticked changes against the cards as they are *now* — another fix may have changed the
 * same field since these were suggested, so each quoted passage is looked up again. Returns how many
 * changes were skipped because their passage isn't there any more. */
export function applyReviewedChanges(changes: ReviewableChange[]): number {
  const { characters: slots, updateSlotCard } = useCardStore.getState();
  const patches = new Map<string, Partial<NormalizedCard>>();
  let skipped = 0;
  for (const change of changes) {
    if (!change.enabled || change.problem || !change.slotId) continue;
    const slot = slots.find((s) => s.id === change.slotId);
    if (!slot) {
      skipped++;
      continue;
    }
    const patch = patches.get(slot.id) ?? {};
    const next = applySnippet(patch[change.field] ?? slot.card[change.field], change.find, change.replace);
    if (next === null) {
      skipped++;
      continue;
    }
    patches.set(slot.id, { ...patch, [change.field]: next });
  }
  for (const [id, patch] of patches) updateSlotCard(id, patch);
  return skipped;
}

interface Props {
  changes: ReviewableChange[];
  onEdit: (index: number, patch: Partial<ReviewableChange>) => void;
}

/** Review list for proposed find/replace edits (consistency fixes, new members worked into
 * reference cards): old passage struck through, new one editable, a tick per change. Changes the
 * code couldn't match to a card stay visible but can't be ticked. */
export function FixChangeList({ changes, onEdit }: Props) {
  return (
    <>
      {changes.map((change, ci) => (
        <div key={ci} className={change.problem ? "consistency-change unusable" : "consistency-change"}>
          <label className="field-inline">
            <input
              type="checkbox"
              checked={change.enabled}
              disabled={!!change.problem}
              onChange={(e) => onEdit(ci, { enabled: e.target.checked })}
            />
            <strong>{change.character}</strong> · {CONSISTENCY_FIX_FIELD_LABELS[change.field]}
          </label>
          {change.problem && <p className="field-error">{change.problem}</p>}
          <div className="consistency-change-before">{change.find}</div>
          <textarea
            className="field-textarea"
            rows={2}
            value={change.replace}
            disabled={!!change.problem}
            onChange={(e) => onEdit(ci, { replace: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}
