import { useEffect, useState } from "react";
import { requestGroupGenerate, requestIntegration } from "../../io/aiClient";
import type { AiGroupMemberDraft } from "../../schema/aiGroupGenerate";
import { additionsToChanges } from "../../schema/aiIntegrateMembers";
import {
  buildGroupGenerateSystemPrompt,
  buildGroupGenerateUserTurn,
  buildIntegrateMembersSystemPrompt,
  buildIntegrateMembersUserTurn,
  findDuplicateReferenceNames,
  summarizeCardForAi,
} from "../../schema/aiPrompt";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";
import { AiProviderSettings } from "./AiProviderSettings";
import { applyReviewedChanges, FixChangeList, type ReviewableChange } from "./FixChangeList";

/** The optional second step: edits that work the new characters into the reference cards. */
interface IntegrationState {
  status: "loading" | "ready" | "error";
  explanation?: string;
  changes?: ReviewableChange[];
  error?: string;
}

interface Props {
  onClose: () => void;
  /** Called after adding cards that were based on reference cards — the caller offers the
   * consistency check then, since new and existing cards should be checked together. */
  onAddedWithReferences?: () => void;
}

const MAX_COUNT = 30;

/** Generates several new characters from one prompt, all at once — the model sees every member
 * while writing the others, so it can keep ages/relationships/names consistent by construction
 * instead of relying on AiConsistencyCheckPanel to catch mismatches afterwards. Each re-send is a
 * fresh, independent batch (no draft-plus-instruction refinement like AiAssistPanel) — simpler,
 * and matches how buildGroupGenerateUserTurn is built (no prior draft echoed back). */
export function AiGroupGeneratePanel({ onClose, onAddedWithReferences }: Props) {
  const characters = useCardStore((s) => s.characters);
  const personas = usePersonaStore((s) => s.characters);
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [count, setCount] = useState(4);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<AiGroupMemberDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set());
  /** Draft members that re-create a reference character — unticked and marked, see handleSend. */
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  /** Whether the current draft was generated with references (not whether some are ticked now). */
  const [draftUsedReferences, setDraftUsedReferences] = useState(false);
  const [personaId, setPersonaId] = useState("");
  /** Also work the new characters into the reference cards (second AI step, reviewed edits). */
  const [integrate, setIntegrate] = useState(true);
  /** Reference tabs the current draft was generated against — what the integration step edits. */
  const [draftReferences, setDraftReferences] = useState<{ id: string; card: NormalizedCard }[]>([]);
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const referenceChoices = characters.filter((c) => c.card.name.trim());
  const personaChoices = personas.filter((p) => p.card.name.trim());
  const allReferencesSelected = referenceChoices.length > 0 && referenceChoices.every((c) => referenceIds.has(c.id));

  function toggleReference(id: string) {
    const next = new Set(referenceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setReferenceIds(next);
  }

  function toggleAllReferences() {
    setReferenceIds(allReferencesSelected ? new Set() : new Set(referenceChoices.map((c) => c.id)));
  }

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const countValid = Number.isInteger(count) && count >= 1 && count <= MAX_COUNT;
  const canSend = providerReady && countValid && instruction.trim() !== "" && !isSending;
  const canApply = [...selected].length > 0 && integration?.status !== "loading";

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
      // Current state of the ticked tabs (unsaved edits included), in tab order.
      const refSlots = referenceChoices.filter((c) => referenceIds.has(c.id)).map(({ id, card }) => ({ id, card }));
      const references = refSlots.map((c) => summarizeCardForAi(c.card));
      const persona = personaChoices.find((p) => p.id === personaId)?.card;
      setIntegration(null);
      const members = await requestGroupGenerate(activeProfile, count, [
        {
          role: "system",
          content: buildGroupGenerateSystemPrompt(count, { references: references.length > 0, persona: !!persona }),
        },
        buildGroupGenerateUserTurn(
          instruction,
          references,
          persona ? { name: persona.name, description: persona.description } : undefined,
        ),
      ]);
      const dupes = findDuplicateReferenceNames(members, references);
      const keep = new Set(members.map((_, i) => i).filter((i) => !dupes.has(i)));
      setDraft(members);
      setDuplicates(dupes);
      setDraftUsedReferences(references.length > 0);
      setDraftReferences(refSlots);
      // Fresh batch: everything checked by default — except re-created reference characters.
      setSelected(keep);
      if (integrate && refSlots.length > 0) {
        void suggestIntegration(
          members.filter((_, i) => keep.has(i)),
          refSlots,
        );
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  /** Asks for edits that make the reference cards know the new characters. Run right after
   * generating, and again on demand (e.g. after unticking some new characters). */
  async function suggestIntegration(members: AiGroupMemberDraft[], refSlots: { id: string; card: NormalizedCard }[]) {
    if (!activeProfile || members.length === 0 || refSlots.length === 0) return;
    setIntegration({ status: "loading" });
    try {
      // The cards as they are now — the user may have edited a reference tab meanwhile.
      const current = useCardStore.getState().characters;
      const slots = refSlots.map((r) => current.find((c) => c.id === r.id) ?? r);
      const result = await requestIntegration(activeProfile, [
        { role: "system", content: buildIntegrateMembersSystemPrompt() },
        buildIntegrateMembersUserTurn(
          slots.map((c) => summarizeCardForAi(c.card)),
          members,
        ),
      ]);
      // Additions aimed at a new character are dropped — those cards are written by the first step.
      const newNames = new Set(members.map((m) => m.name.trim().toLowerCase()));
      const changes = additionsToChanges(
        result.additions.filter((a) => !newNames.has(a.character.trim().toLowerCase())),
        slots,
      ).map((c) => ({ ...c, enabled: !c.problem }));
      setIntegration({ status: "ready", explanation: result.explanation, changes });
    } catch (err) {
      setIntegration({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  function editIntegrationChange(index: number, patch: Partial<ReviewableChange>) {
    setIntegration((prev) =>
      prev?.changes ? { ...prev, changes: prev.changes.map((c, i) => (i === index ? { ...c, ...patch } : c)) } : prev,
    );
  }

  function handleApply() {
    // Edits to the existing tabs first — adding the new tabs below switches the active card.
    if (integration?.status === "ready" && integration.changes) applyReviewedChanges(integration.changes);
    for (const [i, member] of draft.entries()) {
      if (!selected.has(i)) continue;
      newCard();
      updateCard(member);
    }
    onClose();
    if (draftUsedReferences) onAddedWithReferences?.();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Create Group</h3>
        <p className="field-hint">
          Generates several new, mutually consistent characters from one prompt — each is added as its own tab.
        </p>

        {referenceChoices.length > 0 && (
          <div>
            <p className="field-hint">
              Reference cards (optional) — new characters fit into these and use what they already say, e.g. “brother
              and mother of this character” or people mentioned in the cards. References stay unchanged.
            </p>
            <div className="ai-assist-field-checkboxes">
              <button type="button" className="secondary" onClick={toggleAllReferences}>
                {allReferencesSelected ? "Select none" : "Select all"}
              </button>
              {referenceChoices.map((c) => (
                <label key={c.id} className="ai-assist-field-checkbox">
                  <input type="checkbox" checked={referenceIds.has(c.id)} onChange={() => toggleReference(c.id)} />
                  {c.card.name}
                </label>
              ))}
            </div>
            {referenceIds.size > 0 && (
              <label className="field-inline">
                <input type="checkbox" checked={integrate} onChange={(e) => setIntegrate(e.target.checked)} />
                Also update the reference cards so they know the new characters (you review the edits)
              </label>
            )}
          </div>
        )}

        {personaChoices.length > 0 && (
          <label className="field">
            <span className="field-label">Persona (optional, open in the Personas mode)</span>
            <select className="field-input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">None</option>
              {personaChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.card.name}
                </option>
              ))}
            </select>
            <span className="field-hint">
              New characters can relate to your persona — they write it as {"{{user}}"}. The persona stays unchanged.
            </span>
          </label>
        )}

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
                  <span className="ai-assist-draft-label">
                    {member.name || "Character"}
                    {duplicates.has(i) && " — already exists as a reference card, not added by default"}
                  </span>
                  <p className="ai-assist-draft-value">{member.description}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        {draft.length > 0 && draftUsedReferences && (
          <div className="consistency-fix">
            <span className="ai-assist-draft-label">Changes to the reference cards</span>
            {integration?.status === "loading" && (
              <p className="field-hint">Working the new characters into the reference cards…</p>
            )}
            {integration?.status === "error" && <p className="field-error">{integration.error}</p>}
            {integration?.status === "ready" && (
              <>
                {integration.explanation && <p className="field-hint">{integration.explanation}</p>}
                {integration.changes && integration.changes.length > 0 ? (
                  <FixChangeList changes={integration.changes} onEdit={editIntegrationChange} />
                ) : (
                  <p className="field-hint">No changes needed.</p>
                )}
              </>
            )}
            {integration?.status !== "loading" && (
              <div className="consistency-fix-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={!providerReady || selected.size === 0}
                  onClick={() => void suggestIntegration(draft.filter((_, i) => selected.has(i)), draftReferences)}
                  title="Suggest edits for the currently ticked new characters"
                >
                  {integration ? "Suggest again" : "Suggest edits"}
                </button>
              </div>
            )}
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
            placeholder={
              referenceIds.size > 0
                ? "e.g. “Her brother, mother and private tutor”"
                : "e.g. “Family of four: father a craftsman, mother a doctor, two teenage kids”"
            }
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
