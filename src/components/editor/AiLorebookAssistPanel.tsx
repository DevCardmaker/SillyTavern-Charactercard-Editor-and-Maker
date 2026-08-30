import { useEffect, useState } from "react";
import { requestLorebookEntries } from "../../io/aiClient";
import { mergeLorebookEntries } from "../../io/lorebookIO";
import type { AiLorebookEntryDraft } from "../../schema/aiLorebookAssist";
import { buildLorebookSystemPrompt, buildLorebookUserTurn } from "../../schema/aiPrompt";
import type { Lorebook } from "../../schema/lorebook";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  book: Lorebook | undefined;
  onChange: (book: Lorebook) => void;
  onClose: () => void;
}

/** Proposes NEW lorebook entries from a free-text description, refined iteratively like
 * `AiAssistPanel`, but additive rather than replace-a-field: each proposed entry has its own
 * checkbox (default checked, since nothing existing is at risk of being overwritten here), and
 * "Add selected" appends the checked ones to the card's lorebook via `mergeLorebookEntries` —
 * existing entries are never touched. */
export function AiLorebookAssistPanel({ book, onChange, onClose }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [draft, setDraft] = useState<AiLorebookEntryDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [transcript, setTranscript] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canSend = providerReady && instruction.trim() !== "" && !isSending;
  const canApply = [...selected].length > 0;

  function toggleSelected(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  }

  async function handleSend() {
    if (!activeProfile || !canSend) return;
    setIsSending(true);
    setSendError(null);
    try {
      const entries = await requestLorebookEntries(activeProfile, [
        { role: "system", content: buildLorebookSystemPrompt() },
        buildLorebookUserTurn(instruction, draft),
      ]);
      setDraft(entries);
      setSelected(new Set(entries.map((_, i) => i))); // fresh batch: everything checked by default
      setTranscript((prev) => [...prev, instruction]);
      setInstruction("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleApply() {
    const chosen = draft.filter((_, i) => selected.has(i));
    onChange(mergeLorebookEntries(book, chosen));
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>AI Lorebook Assistant</h3>

        <AiProviderSettings />

        {draft.length > 0 && (
          <div className="ai-assist-draft">
            {draft.map((entry, i) => (
              <label key={i} className="ai-lorebook-draft-entry">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} />
                <div>
                  <span className="ai-assist-draft-label">{entry.comment || entry.keys.join(", ") || "Entry"}</span>
                  <p className="ai-assist-draft-value">
                    <em>Keys: {entry.keys.join(", ") || "—"}</em>
                    {"\n"}
                    {entry.content}
                  </p>
                </div>
              </label>
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
            placeholder="e.g. “Family: mother Elara, father Tom. Best friend: Jonas, a blacksmith.”"
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
          <button type="button" onClick={handleApply} disabled={!canApply}>
            Add selected
          </button>
        </div>
      </div>
    </div>
  );
}
