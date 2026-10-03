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
  /** One field ("Condense…" next to it) or several ("Condense all…"). */
  fields: BudgetField[];
  /** Which of `fields` start ticked — all of them if omitted. */
  initiallySelected?: BudgetField[];
  /** Where the card is saved, if anywhere — the pre-condense backup goes next to it. */
  filePath: string | null;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onClose: () => void;
  /** Called after applying, with the path of the backup taken right before. */
  onApplied?: (backupPath: string) => void;
}

/** Share of the original length to aim for. */
const TARGETS = [0.75, 0.6, 0.5] as const;

/** Condenses card fields with AI — same facts, fewer tokens — section by section (see
 * `splitForCondense`), one field after another. Original and result side by side per field, each
 * one can be left out again; nothing touches the card until "Apply", which first writes one backup
 * of the whole card and then applies all accepted fields in a single change. */
export function AiCondensePanel({ card, fields, initiallySelected, filePath, onChange, onClose, onApplied }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const count = useTokenCounter();

  const [target, setTarget] = useState<(typeof TARGETS)[number]>(0.6);
  const [selected, setSelected] = useState<Set<BudgetField>>(() => new Set(initiallySelected ?? fields));
  const [results, setResults] = useState<Partial<Record<BudgetField, string>>>({});
  const [accepted, setAccepted] = useState<Set<BudgetField>>(new Set());
  const [kept, setKept] = useState<Partial<Record<BudgetField, number>>>({});
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const tokens = (text: string) => (count ? count(text) : 0);
  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const chosen = fields.filter((f) => selected.has(f));
  const chosenTokens = chosen.reduce((sum, f) => sum + tokens(card[f]), 0);
  const hasResults = Object.keys(results).length > 0;
  const isSingle = fields.length === 1;

  function toggle(set: Set<BudgetField>, field: BudgetField): Set<BudgetField> {
    const next = new Set(set);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    return next;
  }

  async function handleGenerate() {
    if (!activeProfile || !providerReady || !count) return;
    setIsSending(true);
    setSendError(null);
    setResults({});
    setKept({});
    try {
      for (const [fieldIndex, field] of chosen.entries()) {
        const pieces = splitForCondense(card[field], field, count);
        const total = pieces.filter((p) => p.condense).length;
        let done = 0;
        let keptHere = 0;
        const out: string[] = [];
        for (const piece of pieces) {
          if (!piece.condense) {
            out.push(piece.text);
            continue;
          }
          done++;
          const prefix = isSingle ? "" : `${aiFieldLabel(field)} (field ${fieldIndex + 1} of ${chosen.length}): `;
          setProgress(`${prefix}section ${done} of ${total}…`);
          const pieceTokens = count(piece.text);
          const patch = await requestFieldPatch(activeProfile, [field], [
            { role: "system", content: buildCondenseSystemPrompt(field, pieceTokens, Math.round(pieceTokens * target)) },
            buildCondenseUserTurn(piece.text),
          ]);
          const condensed = String(patch[field] ?? "");
          if (looksCutOff(piece.text, condensed)) {
            keptHere++;
            out.push(piece.text);
          } else {
            out.push(condensed.trim());
          }
        }
        // Results appear field by field, so a long "Condense all" run can be reviewed while it continues.
        setResults((prev) => ({ ...prev, [field]: out.join("") }));
        setAccepted((prev) => new Set(prev).add(field));
        setKept((prev) => ({ ...prev, [field]: keptHere }));
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
      setProgress(null);
    }
  }

  async function handleApply() {
    const patch: Partial<NormalizedCard> = {};
    for (const field of fields) {
      const result = results[field];
      if (result !== undefined && accepted.has(field)) patch[field] = result;
    }
    if (Object.keys(patch).length === 0) return;
    try {
      const backupPath = await writeSnapshotBackup(card, filePath, "before-condense");
      onChange(patch);
      onApplied?.(backupPath);
      onClose();
    } catch (err) {
      setSendError(`Backup failed, nothing was changed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const acceptedCount = fields.filter((f) => accepted.has(f) && results[f] !== undefined).length;
  const keptTotal = Object.values(kept).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal condense-modal">
        <h3>{isSingle ? `Condense ${aiFieldLabel(fields[0])}` : "Condense all"}</h3>
        <p className="field-hint">
          Same character, fewer tokens: the AI condenses section by section, keeping every fact and cutting only
          repetition and filler. Compare both versions before applying — the original stays untouched until then, and
          applying first saves a backup of the whole card.
        </p>

        <AiProviderSettings />

        {!isSingle && (
          <div className="ai-assist-field-checkboxes">
            <span className="field-hint">Fields:</span>
            {fields.map((field) => (
              <label key={field} className="ai-assist-field-checkbox">
                <input
                  type="checkbox"
                  checked={selected.has(field)}
                  disabled={isSending}
                  onChange={() => setSelected((prev) => toggle(prev, field))}
                />
                {aiFieldLabel(field)} ({tokens(card[field])})
              </label>
            ))}
          </div>
        )}

        <div className="ai-assist-field-checkboxes">
          <span className="field-hint">Aim for</span>
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              className={t === target ? "secondary active" : "secondary"}
              onClick={() => setTarget(t)}
            >
              {Math.round(t * 100)}% (~{Math.round(chosenTokens * t)} tokens)
            </button>
          ))}
        </div>

        {chosen.map((field) => {
          const original = card[field];
          const result = results[field];
          const originalTokens = tokens(original);
          const resultTokens = result !== undefined ? tokens(result) : null;
          return (
            <div key={field} className="condense-field">
              {!isSingle && (
                <label className="ai-assist-field-checkbox">
                  <input
                    type="checkbox"
                    checked={accepted.has(field)}
                    disabled={result === undefined}
                    onChange={() => setAccepted((prev) => toggle(prev, field))}
                  />
                  <strong>{aiFieldLabel(field)}</strong>
                  {result !== undefined && <span className="field-hint"> — apply this one</span>}
                </label>
              )}
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
            </div>
          );
        })}

        {keptTotal > 0 && (
          <p className="field-hint">
            {keptTotal} section(s) kept unchanged — the AI's reply was cut off there. “Try again” may get them too.
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
          <button
            type="button"
            className="secondary"
            onClick={handleGenerate}
            disabled={!providerReady || isSending || !count || chosen.length === 0}
          >
            {isSending ? "Condensing…" : hasResults ? "Try again" : "Condense"}
          </button>
          <button type="button" onClick={handleApply} disabled={acceptedCount === 0 || isSending}>
            {isSingle ? "Back up & apply" : `Back up & apply ${acceptedCount} field(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
