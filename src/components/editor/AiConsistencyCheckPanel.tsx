import { useEffect, useState } from "react";
import { requestConsistencyCheck, requestConsistencyFix } from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import type { AiConsistencyFinding } from "../../schema/aiConsistencyCheck";
import {
  applySnippet,
  CONSISTENCY_FIX_FIELD_LABELS,
  type ResolvedFixChange,
  resolveFixChanges,
} from "../../schema/aiConsistencyFix";
import type { NormalizedCard } from "../../schema/normalize";
import {
  buildConsistencyCheckSystemPrompt,
  buildConsistencyCheckUserTurn,
  buildConsistencyFixSystemPrompt,
  buildConsistencyFixUserTurn,
  summarizeCardForAi,
} from "../../schema/aiPrompt";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

/** One finding's fix: the AI's proposed edits, which the user reviews (and can edit or untick)
 * before anything touches a card. */
interface FixState {
  hint: string;
  status: "idle" | "loading" | "ready" | "applied" | "error";
  error?: string;
  explanation?: string;
  changes?: (ResolvedFixChange & { enabled: boolean })[];
  /** After applying: changes whose text had changed in the meantime and were skipped. */
  skipped?: number;
}

const IDLE_FIX: FixState = { hint: "", status: "idle" };

/** Cross-character check over every open tab. Each finding can get an AI fix — small find/replace
 * edits, checked against the cards and shown for review — so contradictions spread over several
 * cards can be resolved right here instead of hunting them down tab by tab. Reads `characters`
 * straight from the store (same pattern as CharacterTabBar) since this spans every open tab. */
export function AiConsistencyCheckPanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const setActiveCharacter = useCardStore((s) => s.setActiveCharacter);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [instruction, setInstruction] = useState("");
  const [findings, setFindings] = useState<AiConsistencyFinding[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [fixes, setFixes] = useState<Record<number, FixState>>({});
  const [isFixingAll, setIsFixingAll] = useState(false);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canCheck = providerReady && !isChecking;

  async function handleCheck() {
    if (!activeProfile || !canCheck) return;
    setIsChecking(true);
    setCheckError(null);
    try {
      const summaries = characters.map((c) => summarizeCardForAi(c.card));
      const result = await requestConsistencyCheck(activeProfile, [
        { role: "system", content: buildConsistencyCheckSystemPrompt() },
        buildConsistencyCheckUserTurn(summaries, instruction),
      ]);
      setFindings(result);
      setFixes({});
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsChecking(false);
    }
  }

  function patchFix(index: number, patch: Partial<FixState>) {
    setFixes((prev) => ({ ...prev, [index]: { ...(prev[index] ?? IDLE_FIX), ...patch } }));
  }

  async function suggestFix(index: number, hint: string) {
    if (!activeProfile || !findings) return;
    patchFix(index, { status: "loading", error: undefined });
    try {
      // Every open character, not only the affected ones, so the fix doesn't create a new contradiction.
      const current = useCardStore.getState().characters;
      const fix = await requestConsistencyFix(activeProfile, [
        { role: "system", content: buildConsistencyFixSystemPrompt() },
        buildConsistencyFixUserTurn(
          current.map((c) => summarizeCardForAi(c.card)),
          findings[index].issue,
          hint,
        ),
      ]);
      const changes = resolveFixChanges(fix.changes, current).map((c) => ({ ...c, enabled: !c.problem }));
      patchFix(index, {
        status: changes.length > 0 ? "ready" : "error",
        explanation: fix.explanation,
        changes,
        error: changes.length > 0 ? undefined : "The AI proposed no changes — try again, maybe with a hint.",
      });
    } catch (err) {
      patchFix(index, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function suggestAll() {
    if (!activeProfile || !findings) return;
    setIsFixingAll(true);
    try {
      const open = findings.map((_, i) => i).filter((i) => !["ready", "applied", "loading"].includes(fixes[i]?.status ?? "idle"));
      await mapConcurrent(open, concurrencyFor(activeProfile), (i) => suggestFix(i, fixes[i]?.hint ?? ""));
    } finally {
      setIsFixingAll(false);
    }
  }

  function editChange(index: number, changeIndex: number, patch: Partial<ResolvedFixChange & { enabled: boolean }>) {
    const fix = fixes[index];
    if (!fix?.changes) return;
    patchFix(index, { changes: fix.changes.map((c, i) => (i === changeIndex ? { ...c, ...patch } : c)) });
  }

  /** Applies against the cards as they are *now* — another fix may have changed the same field
   * since this one was suggested, so each quoted passage is looked up again. */
  function applyFix(index: number) {
    const fix = fixes[index];
    if (!fix?.changes) return;
    const { characters: slots, updateSlotCard } = useCardStore.getState();
    const patches = new Map<string, Partial<NormalizedCard>>();
    let skipped = 0;
    for (const change of fix.changes) {
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
    patchFix(index, { status: "applied", skipped });
  }

  function jumpTo(name: string) {
    const match = characters.find((c) => c.card.name === name);
    if (!match) return;
    setActiveCharacter(match.id);
    onClose();
  }

  function renderFix(index: number) {
    const fix = fixes[index] ?? IDLE_FIX;
    if (fix.status === "applied") {
      return (
        <p className="field-hint">
          ✓ Fix applied{fix.skipped ? ` — ${fix.skipped} change(s) skipped because the text had changed meanwhile` : ""}.
        </p>
      );
    }
    return (
      <div className="consistency-fix">
        {fix.status !== "ready" && (
          <div className="consistency-fix-row">
            <input
              className="field-input"
              value={fix.hint}
              placeholder="Optional: which version is right? e.g. “Mother is 45”"
              onChange={(e) => patchFix(index, { hint: e.target.value })}
            />
            <button
              type="button"
              className="secondary"
              disabled={!providerReady || fix.status === "loading"}
              onClick={() => void suggestFix(index, fix.hint)}
            >
              {fix.status === "loading" ? "Thinking…" : "Suggest fix"}
            </button>
          </div>
        )}
        {fix.error && <p className="field-error">{fix.error}</p>}
        {fix.status === "ready" && fix.changes && (
          <>
            {fix.explanation && <p className="field-hint">{fix.explanation}</p>}
            {fix.changes.map((change, ci) => (
              <div key={ci} className={change.problem ? "consistency-change unusable" : "consistency-change"}>
                <label className="field-inline">
                  <input
                    type="checkbox"
                    checked={change.enabled}
                    disabled={!!change.problem}
                    onChange={(e) => editChange(index, ci, { enabled: e.target.checked })}
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
                  onChange={(e) => editChange(index, ci, { replace: e.target.value })}
                />
              </div>
            ))}
            <div className="consistency-fix-row">
              <button type="button" className="secondary" onClick={() => patchFix(index, { status: "idle", changes: undefined })}>
                Discard
              </button>
              <button type="button" disabled={!fix.changes.some((c) => c.enabled && !c.problem)} onClick={() => applyFix(index)}>
                Apply fix
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Consistency Check</h3>
        <p className="field-hint">
          Checks the {characters.length} currently open characters together for contradictions (age, relationships,
          names, timeline/location). Each finding can get a suggested fix — small text edits you review before they're
          applied.
        </p>

        <AiProviderSettings />

        {findings !== null && (
          <div className="ai-assist-draft">
            {findings.length === 0 ? (
              <p className="ai-assist-draft-value">No contradictions found.</p>
            ) : (
              findings.map((finding, i) => (
                <div key={i} className="ai-consistency-finding">
                  <p className="ai-assist-draft-value">{finding.issue}</p>
                  <div className="ai-consistency-finding-chips">
                    {finding.characters.map((name) => {
                      const known = characters.some((c) => c.card.name === name);
                      return known ? (
                        <button
                          key={name}
                          type="button"
                          className="ai-consistency-chip"
                          onClick={() => jumpTo(name)}
                          title={`Jump to “${name}”`}
                        >
                          {name}
                        </button>
                      ) : (
                        <span key={name} className="ai-consistency-chip ai-consistency-chip-unknown">
                          {name}
                        </span>
                      );
                    })}
                  </div>
                  {renderFix(i)}
                </div>
              ))
            )}
          </div>
        )}

        {findings !== null && findings.length > 1 && (
          <div className="modal-actions">
            <button type="button" className="secondary" disabled={!providerReady || isFixingAll} onClick={() => void suggestAll()}>
              {isFixingAll ? "Suggesting fixes…" : "Suggest fixes for all"}
            </button>
          </div>
        )}
        {Object.values(fixes).some((f) => f.status === "applied") && (
          <p className="field-hint">
            Fixed cards are marked as unsaved. Run “Check again” afterwards — a fix can bring up a follow-up contradiction
            (e.g. a changed age that no longer fits a wedding year). If you used “Group lorebook”, run it again too.
          </p>
        )}

        {!providerReady && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {checkError && <p className="field-error">{checkError}</p>}

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional: anything specific to watch for? e.g. “ages”"
            rows={2}
          />
          <button type="button" onClick={handleCheck} disabled={!canCheck}>
            {isChecking ? "Checking…" : findings === null ? "Check" : "Check again"}
          </button>
        </div>
        {isChecking && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
