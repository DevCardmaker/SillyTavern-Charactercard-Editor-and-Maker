import { useEffect, useState } from "react";
import { requestFieldPatch } from "../../io/aiClient";
import { AI_FIELD_KEYS, type AiFieldKey, type AiFieldPatch, aiFieldLabel, isEmptyField } from "../../schema/aiAssist";
import { buildSystemPrompt, buildUserTurn } from "../../schema/aiPrompt";
import {
  buildWritingNotes,
  FIELD_LENGTHS,
  fieldsWithLength,
  OPENING_POVS,
  usesOpeningPov,
  type FieldLength,
  type LengthChoices,
  type OpeningPov,
} from "../../schema/writingOptions";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  card: NormalizedCard;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onClose: () => void;
  /** Which fields can be picked — all card fields by default; personas pass their own subset. */
  fieldKeys?: readonly AiFieldKey[];
  /** System prompt for the picked fields — the character-card prompt by default. */
  buildSystem?: (fields: readonly AiFieldKey[]) => string;
  title?: string;
  placeholder?: string;
  /** Optional cards the user can tick as context (e.g. "fit this persona to characters X and Y");
   * `buildContext` turns the ticked ones into text sent ahead of the draft with every message. */
  contextChoices?: { label: string; card: NormalizedCard }[];
  buildContext?: (cards: NormalizedCard[]) => string;
  contextLabel?: string;
}

function displayValue(key: AiFieldKey, draft: AiFieldPatch): string {
  const value = draft[key];
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(key === "tags" ? ", " : "\n\n");
  return String(value);
}

const LENGTH_KEY = "ai-assist-length";
const POV_KEY = "ai-assist-pov";

/** The last choice, if it's still a valid one. Storage can be unavailable: nothing depends on it. */
function readStored<T extends string>(key: string, allowed: readonly T[]): T | "" {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : "";
  } catch {
    return "";
  }
}

function storeChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience: the choice applies for now either way.
  }
}

/** Iterative AI assistant: refines a draft (separate from the live card) across as many messages
 * as the user wants, then commits it to the real card in one explicit step via `onChange`. Draft
 * state is intentionally component-local (see plan) — it's transient and has no other reader, so
 * closing this panel without "Apply to card" simply discards it. */
export function AiAssistPanel({
  card,
  onChange,
  onClose,
  fieldKeys = AI_FIELD_KEYS,
  buildSystem = buildSystemPrompt,
  title = "AI Assistant",
  placeholder = "e.g. “A shy librarian with a secret” or “Make the personality more sarcastic”",
  contextChoices,
  buildContext,
  contextLabel = "Context",
}: Props) {
  const [contextIndices, setContextIndices] = useState<Set<number>>(new Set());
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [selectedFields, setSelectedFields] = useState<Set<AiFieldKey>>(new Set());
  const [draft, setDraft] = useState<AiFieldPatch>({});
  const [transcript, setTranscript] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lengths, setLengths] = useState<LengthChoices>(() => ({ all: readStored(LENGTH_KEY, FIELD_LENGTHS), fields: {} }));
  const [pov, setPov] = useState<OpeningPov | "">(() => readStored(POV_KEY, OPENING_POVS));

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  function toggleField(key: AiFieldKey) {
    const next = new Set(selectedFields);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (!(key in draft)) setDraft({ ...draft, [key]: card[key] });
    }
    setSelectedFields(next);
  }

  const allSelected = fieldKeys.every((key) => selectedFields.has(key));

  /** Select all / none in one click. Newly selected fields get seeded into the draft from the card,
   * same as ticking them one by one in `toggleField`. */
  function toggleAllFields() {
    if (allSelected) {
      setSelectedFields(new Set());
      return;
    }
    const seeded = { ...draft };
    for (const key of fieldKeys) {
      if (!(key in seeded)) Object.assign(seeded, { [key]: card[key] });
    }
    setDraft(seeded);
    setSelectedFields(new Set(fieldKeys));
  }

  const emptyFields = fieldKeys.filter((key) => isEmptyField(card, key));

  /** Ticks exactly what's still empty, for completing an imported card. */
  function selectEmptyFields() {
    const seeded = { ...draft };
    for (const key of emptyFields) {
      if (!(key in seeded)) Object.assign(seeded, { [key]: card[key] });
    }
    setDraft(seeded);
    setSelectedFields(new Set(emptyFields));
  }

  function chooseAllLength(value: FieldLength | "") {
    setLengths((prev) => ({ ...prev, all: value }));
    storeChoice(LENGTH_KEY, value);
  }

  function chooseFieldLength(key: AiFieldKey, value: FieldLength | "same") {
    setLengths((prev) => {
      const fields = { ...prev.fields };
      if (value === "same") delete fields[key];
      else fields[key] = value;
      return { ...prev, fields };
    });
  }

  function choosePov(value: OpeningPov | "") {
    setPov(value);
    storeChoice(POV_KEY, value);
  }

  function toggleContext(index: number) {
    const next = new Set(contextIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setContextIndices(next);
  }

  const allContextSelected = !!contextChoices && contextChoices.every((_, i) => contextIndices.has(i));

  function toggleAllContext() {
    setContextIndices(allContextSelected ? new Set() : new Set(contextChoices?.map((_, i) => i)));
  }

  /** Ticked context cards in their listed order — the order the user sees, not the click order. */
  function contextText(): string | undefined {
    if (!contextChoices || !buildContext) return undefined;
    const cards = contextChoices.filter((_, i) => contextIndices.has(i)).map((c) => c.card);
    return cards.length > 0 ? buildContext(cards) : undefined;
  }

  const lengthFields = fieldsWithLength([...selectedFields]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canSend = providerReady && selectedFields.size > 0 && instruction.trim() !== "" && !isSending;

  async function handleSend() {
    if (!activeProfile || !canSend) return;
    setIsSending(true);
    setSendError(null);
    try {
      const fields = [...selectedFields];
      const patch = await requestFieldPatch(activeProfile, fields, [
        { role: "system", content: [buildSystem(fields), ...buildWritingNotes(fields, lengths, pov)].join("\n") },
        buildUserTurn(instruction, draft, contextText()),
      ]);
      setDraft((prev) => ({ ...prev, ...patch }));
      setTranscript((prev) => [...prev, instruction]);
      setInstruction("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleApply() {
    onChange(draft);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>{title}</h3>

        <AiProviderSettings />

        <div>
          <p className="field-hint">Which fields may the AI change?</p>
          <div className="ai-assist-field-checkboxes">
            <button type="button" className="secondary" onClick={toggleAllFields}>
              {allSelected ? "Select none" : "Select all"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={selectEmptyFields}
              disabled={emptyFields.length === 0}
              title="Tick only the fields that are still empty"
            >
              Select empty
            </button>
            {fieldKeys.map((key) => (
              <label key={key} className="ai-assist-field-checkbox">
                <input type="checkbox" checked={selectedFields.has(key)} onChange={() => toggleField(key)} />
                {aiFieldLabel(key)}
              </label>
            ))}
          </div>
        </div>

        {lengthFields.length > 0 && (
          <div className="ai-assist-writing">
            <label className="field-inline">
              Length
              <select value={lengths.all} onChange={(e) => chooseAllLength(e.target.value as FieldLength | "")}>
                <option value="">As you ask</option>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
            {usesOpeningPov([...selectedFields]) && (
              <label className="field-inline">
                Opening point of view
                <select value={pov} onChange={(e) => choosePov(e.target.value as OpeningPov | "")}>
                  <option value="">As you ask</option>
                  <option value="first">First person</option>
                  <option value="second">Second person</option>
                  <option value="third">Third person</option>
                </select>
              </label>
            )}
            {lengthFields.length > 1 && (
              <details className="ai-assist-writing-fields">
                <summary>Length per field</summary>
                {lengthFields.map((key) => (
                  <label key={key} className="field-inline">
                    {aiFieldLabel(key)}
                    <select
                      value={lengths.fields[key] ?? "same"}
                      onChange={(e) => chooseFieldLength(key, e.target.value as FieldLength | "same")}
                    >
                      <option value="same">Same as above</option>
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="long">Long</option>
                    </select>
                  </label>
                ))}
              </details>
            )}
          </div>
        )}

        {contextChoices && contextChoices.length > 0 && (
          <div>
            <p className="field-hint">{contextLabel}</p>
            <div className="ai-assist-field-checkboxes">
              <button type="button" className="secondary" onClick={toggleAllContext}>
                {allContextSelected ? "Select none" : "Select all"}
              </button>
              {contextChoices.map((choice, i) => (
                <label key={i} className="ai-assist-field-checkbox">
                  <input type="checkbox" checked={contextIndices.has(i)} onChange={() => toggleContext(i)} />
                  {choice.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {selectedFields.size > 0 && (
          <div className="ai-assist-draft">
            {[...selectedFields].map((key) => (
              <div key={key} className="ai-assist-draft-field">
                <span className="ai-assist-draft-label">{aiFieldLabel(key)}</span>
                <p className="ai-assist-draft-value">{displayValue(key, draft) || "—"}</p>
              </div>
            ))}
          </div>
        )}

        {transcript.length > 0 && (
          <div className="ai-assist-transcript">
            {transcript.map((entry, i) => (
              <p key={i} className="ai-assist-transcript-entry">
                → {entry}
              </p>
            ))}
          </div>
        )}

        {!providerReady && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {sendError && <p className="field-error">{sendError}</p>}

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={placeholder}
            rows={2}
          />
          <button type="button" onClick={handleSend} disabled={!canSend}>
            {isSending ? "Sending…" : "Send"}
          </button>
        </div>
        {isSending && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" onClick={handleApply} disabled={selectedFields.size === 0}>
            Apply to card
          </button>
        </div>
      </div>
    </div>
  );
}
