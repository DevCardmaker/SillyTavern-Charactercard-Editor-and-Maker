import { useEffect, useState } from "react";
import { requestRelocate } from "../../io/aiClient";
import { buildRelocateSystemPrompt, buildRelocateUserTurn, summarizeCardForAi } from "../../schema/aiPrompt";
import type { AiRelocateMember } from "../../schema/aiRelocate";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

/** Moves every currently open character to a new setting together — rewrites only `scenario` per
 * member, matched back to its tab by name; identity/personality/relationships are left untouched
 * both in the prompt instructions and in what gets applied. Fresh batch per generate (like
 * AiGroupGeneratePanel), not an iterative draft — "regenerate" replaces the whole preview. */
export function AiRelocatePanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const updateSlotCard = useCardStore((s) => s.updateSlotCard);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<AiRelocateMember[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
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
      const summaries = characters.map((c) => summarizeCardForAi(c.card));
      const members = await requestRelocate(activeProfile, characters.length, [
        { role: "system", content: buildRelocateSystemPrompt(characters.length) },
        buildRelocateUserTurn(summaries, instruction),
      ]);
      setDraft(members);
      // Fresh batch: everything checked by default, same as AiGroupGeneratePanel/AiLorebookAssistPanel —
      // the whole point of a group relocate is moving everyone together, not picking survivors.
      setSelected(new Set(members.map((_, i) => i)));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleApply() {
    for (const [i, member] of draft.entries()) {
      if (!selected.has(i)) continue;
      const match = characters.find((c) => c.card.name === member.name);
      if (!match) continue; // model didn't echo the name back exactly — leave that tab untouched
      updateSlotCard(match.id, { scenario: member.scenario });
    }
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Relocate Group</h3>
        <p className="field-hint">
          Rewrites the scenario of all {characters.length} currently open characters for a new shared setting — name,
          description, and personality stay untouched.
        </p>

        <AiProviderSettings />

        {draft.length > 0 && (
          <div className="ai-assist-draft">
            {draft.map((member, i) => {
              const current = characters.find((c) => c.card.name === member.name);
              return (
                <label key={i} className="ai-lorebook-draft-entry">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelected(i)} />
                  <div>
                    <span className="ai-assist-draft-label">{member.name || "Character"}</span>
                    {!current && <p className="field-error">No open tab matches this name — will be skipped.</p>}
                    {current && <p className="ai-assist-draft-value ai-relocate-old-value">{current.card.scenario}</p>}
                    <p className="ai-assist-draft-value">{member.scenario}</p>
                  </div>
                </label>
              );
            })}
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
            placeholder="e.g. “The family moves from New York to Tokyo”"
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
            Apply to cards
          </button>
        </div>
      </div>
    </div>
  );
}
