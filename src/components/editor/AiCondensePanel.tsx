import { useEffect, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { requestFieldPatch } from "../../io/aiClient";
import { writeSnapshotBackup } from "../../io/fileIO";
import { aiFieldLabel } from "../../schema/aiAssist";
import { buildCondenseSystemPrompt, buildCondenseUserTurn } from "../../schema/aiPrompt";
import type { BudgetField } from "../../schema/contextBudget";
import { looksCutOff, splitForCondense } from "../../schema/condense";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  card: NormalizedCard;
  field: BudgetField;
  /** Where the card is saved, if anywhere — the pre-condense backup goes next to it. */
  filePath: string | null;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onClose: () => void;
  /** Called after applying, with the path of the backup taken right before. */
  onApplied?: (backupPath: string) => void;
}

/** Share of the original length to aim for. */
const TARGETS = [0.75, 0.6, 0.5] as const;

/** Condenses one card field with AI — same facts, fewer tokens — section by section (see
 * `splitForCondense`). Original and result side by side; nothing touches the card until "Apply",
 * which first writes a backup of the whole card. */
export function AiCondensePanel({ card, field, filePath, onChange, onClose, onApplied }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const count = useTokenCounter();

  const original = card[field];
  const [target, setTarget] = useState<(typeof TARGETS)[number]>(0.6);
  const [result, setResult] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [keptSections, setKeptSections] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const originalTokens = count ? count(original) : 0;
  const resultTokens = result !== null && count ? count(result) : null;
  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;

  async function handleGenerate() {
    if (!activeProfile || !providerReady || !count) return;
    setIsSending(true);
    setSendError(null);
    try {
      const pieces = splitForCondense(original, field, count);
      const total = pieces.filter((p) => p.condense).length;
      let done = 0;
      let kept = 0;
      const out: string[] = [];
      for (const piece of pieces) {
        if (!piece.condense) {
          out.push(piece.text);
          continue;
        }
        done++;
        setProgress(`Section ${done} of ${total}…`);
        const tokens = count(piece.text);
        const patch = await requestFieldPatch(activeProfile, [field], [
          { role: "system", content: buildCondenseSystemPrompt(field, tokens, Math.round(tokens * target)) },
          buildCondenseUserTurn(piece.text),
        ]);
        const condensed = String(patch[field] ?? "");
        if (looksCutOff(piece.text, condensed)) {
          kept++;
          out.push(piece.text);
        } else {
          out.push(condensed.trim());
        }
      }
      setKeptSections(kept);
      setResult(out.join(""));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
      setProgress(null);
    }
  }

  async function handleApply() {
    if (result === null) return;
    try {
      const backupPath = await writeSnapshotBackup(card, filePath, "before-condense");
      onChange({ [field]: result });
      onApplied?.(backupPath);
      onClose();
    } catch (err) {
      setSendError(`Backup failed, nothing was changed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal condense-modal">
        <h3>Condense {aiFieldLabel(field)}</h3>
        <p className="field-hint">
          Same character, fewer tokens: the AI condenses section by section, keeping every fact and cutting only
          repetition and filler. Compare both versions before applying — the original stays untouched until then, and
          applying first saves a backup of the whole card.
        </p>

        <AiProviderSettings />

        <div className="ai-assist-field-checkboxes">
          <span className="field-hint">Aim for</span>
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              className={t === target ? "secondary active" : "secondary"}
              onClick={() => setTarget(t)}
            >
              {Math.round(t * 100)}% (~{Math.round(originalTokens * t)} tokens)
            </button>
          ))}
        </div>

        <div className="condense-compare">
          <div>
            <span className="field-label">Original · {originalTokens} tokens</span>
            <p className="ai-assist-draft-value">{original}</p>
          </div>
          <div>
            <span className="field-label">
              Condensed
              {resultTokens !== null &&
                ` · ${resultTokens} tokens (${Math.round((1 - resultTokens / Math.max(1, originalTokens)) * 100)}% saved)`}
            </span>
            <p className="ai-assist-draft-value">{result ?? "—"}</p>
          </div>
        </div>

        {keptSections > 0 && (
          <p className="field-hint">
            {keptSections} section(s) kept unchanged — the AI's reply was cut off there. “Try again” may get them too.
          </p>
        )}
        {progress && <p className="field-hint">{progress}</p>}
        {!providerReady && <p className="field-hint">Please set a base URL and model in the provider settings.</p>}
        {sendError && <p className="field-error">{sendError}</p>}
        {isSending && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" className="secondary" onClick={handleGenerate} disabled={!providerReady || isSending || !count}>
            {isSending ? "Condensing…" : result === null ? "Condense" : "Try again"}
          </button>
          <button type="button" onClick={handleApply} disabled={result === null || isSending}>
            Back up &amp; apply
          </button>
        </div>
      </div>
    </div>
  );
}
