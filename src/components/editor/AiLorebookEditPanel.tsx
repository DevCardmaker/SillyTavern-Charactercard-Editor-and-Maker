import { useEffect, useState } from "react";
import { requestLorebookEdit } from "../../io/aiClient";
import type { AiLorebookEditEntry } from "../../schema/aiLorebookEdit";
import {
  buildLorebookEditSystemPrompt,
  buildLorebookEditUserTurn,
  DEFAULT_LOREBOOK_EDIT_INSTRUCTION,
  summarizeLorebookForAi,
} from "../../schema/aiPrompt";
import type { Lorebook } from "../../schema/lorebook";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  book: Lorebook;
  onChange: (book: Lorebook) => void;
  onClose: () => void;
}

function entryLabel(book: Lorebook, index: number): string {
  const entry = book.entries[index];
  return entry?.comment || entry?.keys.join(", ") || `Entry ${index + 1}`;
}

/** "Fill / revise entries with AI": the user picks existing entries (empty ones pre-selected —
 * the main use case is "I named the entries, now write them"), optionally types an instruction,
 * and gets an old/new preview per entry before anything is written. Follow-up instructions refine
 * the current draft (same resend-full-state pattern as AiLorebookAssistPanel). Replies are written
 * back by entry index, which `parseAiLorebookEdit` already checked against what was sent. */
export function AiLorebookEditPanel({ book, onChange, onClose }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const emptyIndices = book.entries.flatMap((e, i) => (e.content.trim() === "" ? [i] : []));
  const [chosen, setChosen] = useState<Set<number>>(new Set(emptyIndices));
  const [draft, setDraft] = useState<AiLorebookEditEntry[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [transcript, setTranscript] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const hasDraft = draft.length > 0;
  // Without a draft, an empty instruction falls back to "fill the empty ones"; refining a draft
  // needs an actual instruction, otherwise there's nothing to change.
  const canSend = providerReady && !isSending && (hasDraft ? instruction.trim() !== "" : chosen.size > 0);

  function toggle(set: Set<number>, value: number, apply: (next: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  async function handleSend() {
    if (!activeProfile || !canSend) return;
    setIsSending(true);
    setSendError(null);
    try {
      const current: AiLorebookEditEntry[] = hasDraft
        ? draft
        : [...chosen].sort((a, b) => a - b).map((index) => {
            const entry = book.entries[index];
            return { index, keys: entry.keys, comment: entry.comment ?? "", content: entry.content };
          });
      const indices = current.map((e) => e.index);
      const result = await requestLorebookEdit(activeProfile, indices, [
        { role: "system", content: buildLorebookEditSystemPrompt(indices.length) },
        buildLorebookEditUserTurn(summarizeLorebookForAi(book, new Set(indices)), current, instruction),
      ]);
      result.sort((a, b) => a.index - b.index);
      setDraft(result);
      setAccepted(new Set(indices));
      setTranscript((prev) => [...prev, instruction.trim() || DEFAULT_LOREBOOK_EDIT_INSTRUCTION]);
      setInstruction("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleApply() {
    const entries = [...book.entries];
    for (const edit of draft) {
      if (!accepted.has(edit.index)) continue;
      entries[edit.index] = { ...entries[edit.index], keys: edit.keys, comment: edit.comment, content: edit.content };
    }
    onChange({ ...book, entries });
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Fill / Revise Entries with AI</h3>

        <AiProviderSettings />

        {!hasDraft && (
          <>
            <p className="field-hint">
              Choose the entries to work on. Empty entries are pre-selected — leave the instruction blank to just
              have their content written from their name and keys.
            </p>
            <div className="field-row">
              <button type="button" className="secondary" onClick={() => setChosen(new Set(emptyIndices))}>
                Select empty ({emptyIndices.length})
              </button>
              <button type="button" className="secondary" onClick={() => setChosen(new Set(book.entries.map((_, i) => i)))}>
                Select all
              </button>
              <button type="button" className="secondary" onClick={() => setChosen(new Set())}>
                Select none
              </button>
            </div>
            <div className="ai-assist-draft">
              {book.entries.map((entry, i) => (
                <label key={i} className="ai-lorebook-draft-entry">
                  <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(chosen, i, setChosen)} />
                  <div>
                    <span className="ai-assist-draft-label">{entryLabel(book, i)}</span>
                    {entry.content.trim() === "" && <em> (empty)</em>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {hasDraft && (
          <div className="ai-assist-draft">
            {draft.map((edit) => {
              const original = book.entries[edit.index];
              return (
                <label key={edit.index} className="ai-lorebook-draft-entry">
                  <input
                    type="checkbox"
                    checked={accepted.has(edit.index)}
                    onChange={() => toggle(accepted, edit.index, setAccepted)}
                  />
                  <div>
                    <span className="ai-assist-draft-label">{edit.comment || entryLabel(book, edit.index)}</span>
                    {original.content.trim() !== "" && (
                      <p className="ai-assist-draft-value ai-relocate-old-value">{original.content}</p>
                    )}
                    <p className="ai-assist-draft-value">
                      <em>Keys: {edit.keys.join(", ") || "—"}</em>
                      {"\n"}
                      {edit.content}
                    </p>
                  </div>
                </label>
              );
            })}
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

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              hasDraft
                ? "Refine, e.g. “make the father stricter” or “shorter”"
                : "Optional, e.g. “more detail”, “add nicknames to the keys”, “translate to German”"
            }
            rows={2}
          />
          <button type="button" onClick={handleSend} disabled={!canSend}>
            {isSending ? "Sending…" : hasDraft ? "Refine" : `Send (${chosen.size})`}
          </button>
        </div>
        {isSending && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
        )}
        {sendError && <p className="field-error">{sendError}</p>}

        <div className="modal-actions">
          {hasDraft && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft([]);
                setTranscript([]);
              }}
            >
              Start over
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" onClick={handleApply} disabled={accepted.size === 0 || !hasDraft}>
            Apply selected
          </button>
        </div>
      </div>
    </div>
  );
}
