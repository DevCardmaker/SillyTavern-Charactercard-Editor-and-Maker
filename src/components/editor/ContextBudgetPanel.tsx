import { useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { type BudgetField, type BudgetLine, contextBudget, DEFAULT_BUDGET_SETTINGS } from "../../schema/contextBudget";
import type { NormalizedCard } from "../../schema/normalize";
import { usePersonaStore } from "../../state/personaStore";
import { AiCondensePanel } from "./AiCondensePanel";

interface Props {
  card: NormalizedCard;
  filePath: string | null;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onClose: () => void;
}

/** How much of the model's context this card takes up, split into what's sent with every message
 * and what only matters at the start of a chat — with "Condense…" next to every large field. */
export function ContextBudgetPanel({ card, filePath, onChange, onClose }: Props) {
  const count = useTokenCounter();
  const personas = usePersonaStore((s) => s.characters);
  const [personaId, setPersonaId] = useState<string>("");
  const [settings, setSettings] = useState(DEFAULT_BUDGET_SETTINGS);
  /** Fields shown in the condense dialog: one ("Condense…") or all large ones ("Condense all…"). */
  const [condensing, setCondensing] = useState<BudgetField[] | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  if (!count) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <p>Loading tokenizer…</p>
        </div>
      </div>
    );
  }

  const persona = personas.find((p) => p.id === personaId)?.card.description ?? "";
  const budget = contextBudget(card, count, settings, persona);
  // Same 100-token threshold as the per-line "Condense…" buttons.
  const condensable = (lines: BudgetLine[]) => lines.filter((l) => l.field && l.tokens >= 100).map((l) => l.field!);
  const permanentFields = condensable(budget.permanent);
  const allFields = [...permanentFields, ...condensable(budget.early)];
  const usable = settings.contextSize - settings.responseLength;
  const pct = (tokens: number) => `${Math.min(100, (tokens / settings.contextSize) * 100)}%`;

  function renderLine(line: BudgetLine) {
    return (
      <div key={line.label} className="budget-line">
        <span>{line.label}</span>
        <span className="budget-tokens">{line.tokens}</span>
        {line.field && line.tokens >= 100 ? (
          <button type="button" className="secondary" onClick={() => setCondensing([line.field!])}>
            Condense…
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  }

  function numberInput(label: string, key: keyof typeof settings) {
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          className="field-input"
          type="number"
          min={0}
          value={settings[key]}
          onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))}
        />
      </label>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Context budget</h3>

        <div className="budget-bar" title="Permanent · start of chat · free for chat history · response">
          <div className="budget-bar-permanent" style={{ width: pct(budget.permanentTotal) }} />
          <div className="budget-bar-early" style={{ width: pct(Math.min(budget.earlyTotal, budget.chatSpace)) }} />
          <div className="budget-bar-free" style={{ flex: 1 }} />
          <div className="budget-bar-response" style={{ width: pct(settings.responseLength) }} />
        </div>
        <p>
          <strong>{budget.permanentTotal}</strong> tokens go out with every message (
          {Math.round((budget.permanentTotal / Math.max(1, usable)) * 100)}% of the usable context).{" "}
          <strong>{budget.chatSpace}</strong> tokens are left for the chat history.
        </p>

        {lastBackup && (
          <p className="field-hint">
            Condensed. The card as it was before is backed up at {lastBackup} — reopen it from there if you change your
            mind.
          </p>
        )}

        {allFields.length > 1 && (
          <div className="field-row">
            <button type="button" className="secondary" onClick={() => setCondensing(allFields)}>
              Condense all…
            </button>
            <span className="field-hint">
              Condenses every large field in one go — fields sent with every message are preselected.
            </span>
          </div>
        )}

        <div className="budget-section">
          <span className="field-label">Sent with every message</span>
          {budget.permanent.length === 0 && <p className="field-hint">Nothing yet.</p>}
          {budget.permanent.map(renderLine)}
        </div>

        <div className="budget-section">
          <span className="field-label">At the start of a chat, pushed out as it grows</span>
          {budget.early.length === 0 && <p className="field-hint">Nothing.</p>}
          {budget.early.map(renderLine)}
        </div>

        {(budget.triggeredLoreEntries > 0 || budget.constantLoreTokens > 0) && (
          <div className="budget-section">
            <span className="field-label">Lorebook</span>
            <p className="field-hint">
              World Info may use up to {budget.worldInfoCap} tokens ({settings.worldInfoPercent}% of the context).
              {budget.constantLoreTokens > budget.worldInfoCap &&
                " The always-active entries alone exceed that — SillyTavern will drop some of them."}
              {budget.triggeredLoreEntries > 0 &&
                ` ${budget.triggeredLoreEntries} entries are inserted only when their keys come up (largest: ${budget.largestTriggeredLore} tokens).`}
            </p>
          </div>
        )}

        <div className="field-row">
          <label className="field">
            <span className="field-label">Persona</span>
            <select className="field-input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">None</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.card.name || "New persona"}
                </option>
              ))}
            </select>
          </label>
          {numberInput("Context size", "contextSize")}
          {numberInput("Response length", "responseLength")}
        </div>
        <p className="field-hint">
          Defaults match your SillyTavern. Personas open in the Personas mode can be included. Counts are estimates —
          Cydonia's tokenizer counts slightly differently, and the instruct template adds a few dozen tokens.
        </p>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {condensing && (
        <AiCondensePanel
          card={card}
          fields={condensing}
          initiallySelected={condensing.length > 1 ? condensing.filter((f) => permanentFields.includes(f)) : undefined}
          filePath={filePath}
          onChange={onChange}
          onClose={() => setCondensing(null)}
          onApplied={setLastBackup}
        />
      )}
    </div>
  );
}
