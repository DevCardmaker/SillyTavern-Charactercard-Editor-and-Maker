import { useEffect, useState } from "react";
import { requestFieldPatch } from "../../io/aiClient";
import { AI_FIELD_KEYS, type AiFieldKey, type AiFieldPatch, aiFieldLabel } from "../../schema/aiAssist";
import { buildSystemPrompt, buildUserTurn } from "../../schema/aiPrompt";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  card: NormalizedCard;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onClose: () => void;
}

function displayValue(key: AiFieldKey, draft: AiFieldPatch): string {
  const value = draft[key];
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(key === "tags" ? ", " : "\n\n");
  return String(value);
}

/** Iterative AI assistant: refines a draft (separate from the live card) across as many messages
 * as the user wants, then commits it to the real card in one explicit step via `onChange`. Draft
 * state is intentionally component-local (see plan) — it's transient and has no other reader, so
 * closing this panel without "Apply to card" simply discards it. */
export function AiAssistPanel({ card, onChange, onClose }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [selectedFields, setSelectedFields] = useState<Set<AiFieldKey>>(new Set());
  const [draft, setDraft] = useState<AiFieldPatch>({});
  const [transcript, setTranscript] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canSend = providerReady && selectedFields.size > 0 && instruction.trim() !== "" && !isSending;

  async function handleSend() {
    if (!activeProfile || !canSend) return;
    setIsSending(true);
    setSendError(null);
    try {
      const fields = [...selectedFields];
      const patch = await requestFieldPatch(activeProfile, fields, [
        { role: "system", content: buildSystemPrompt(fields) },
        buildUserTurn(instruction, draft),
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
        <h3>AI Assistant</h3>

        <AiProviderSettings />

        <div>
          <p className="field-hint">Which fields may the AI change?</p>
          <div className="ai-assist-field-checkboxes">
            {AI_FIELD_KEYS.map((key) => (
              <label key={key} className="ai-assist-field-checkbox">
                <input type="checkbox" checked={selectedFields.has(key)} onChange={() => toggleField(key)} />
                {aiFieldLabel(key)}
              </label>
            ))}
          </div>
        </div>

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
            placeholder="e.g. “A shy librarian with a secret” or “Make the personality more sarcastic”"
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
