import { useEffect, useState } from "react";
import { requestGroupGenerate } from "../../io/aiClient";
import type { AiGroupMemberDraft } from "../../schema/aiGroupGenerate";
import { buildGroupGenerateSystemPrompt, buildGroupGenerateUserTurn } from "../../schema/aiPrompt";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

const MAX_COUNT = 30;

/** Generates several new characters from one prompt, all at once — the model sees every member
 * while writing the others, so it can keep ages/relationships/names consistent by construction
 * instead of relying on AiConsistencyCheckPanel to catch mismatches afterwards. Each re-send is a
 * fresh, independent batch (no draft-plus-instruction refinement like AiAssistPanel) — simpler,
 * and matches how buildGroupGenerateUserTurn is built (no prior draft echoed back). */
export function AiGroupGeneratePanel({ onClose }: Props) {
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [count, setCount] = useState(4);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<AiGroupMemberDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const countValid = Number.isInteger(count) && count >= 1 && count <= MAX_COUNT;
  const canSend = providerReady && countValid && instruction.trim() !== "" && !isSending;
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
      const members = await requestGroupGenerate(activeProfile, count, [
        { role: "system", content: buildGroupGenerateSystemPrompt(count) },
        buildGroupGenerateUserTurn(instruction),
      ]);
      setDraft(members);
      setSelected(new Set(members.map((_, i) => i))); // fresh batch: everything checked by default
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleApply() {
    for (const [i, member] of draft.entries()) {
      if (!selected.has(i)) continue;
      newCard();
      updateCard(member);
    }
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Create Group</h3>
        <p className="field-hint">
          Generates several new, mutually consistent characters from one prompt — each is added as its own tab.
        </p>

        <AiProviderSettings />

        <label className="ai-assist-settings-fields">
          Number of characters
          <input
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>

        {draft.length > 0 && (
          <div className="ai-assist-draft">
            {draft.map((member, i) => (
              <label key={i} className="ai-lorebook-draft-entry">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} />
                <div>
                  <span className="ai-assist-draft-label">{member.name || "Character"}</span>
                  <p className="ai-assist-draft-value">{member.description}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        {!providerReady && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {!countValid && <p className="field-error">Number must be between 1 and {MAX_COUNT}.</p>}
        {sendError && <p className="field-error">{sendError}</p>}

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. “Family of four: father a craftsman, mother a doctor, two teenage kids”"
            rows={2}
          />
          <button type="button" onClick={handleSend} disabled={!canSend}>
            {isSending ? "Sending…" : draft.length > 0 ? "Regenerate" : "Generate"}
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
            Add selected as tabs
          </button>
        </div>
      </div>
    </div>
  );
}
