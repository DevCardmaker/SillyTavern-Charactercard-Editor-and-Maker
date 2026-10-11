import { useEffect, useState } from "react";
import { requestSplitMember, requestSplitPeople } from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import {
  buildSplitMemberSystemPrompt,
  buildSplitMemberUserTurn,
  buildSplitPeopleSystemPrompt,
  buildSplitPeopleUserTurn,
} from "../../schema/aiPrompt";
import {
  type AiSplitMember,
  type AiSplitPerson,
  lorebookEntriesForSplit,
  splitMemberWarning,
} from "../../schema/aiSplitGroup";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

interface Candidate extends AiSplitPerson {
  picked: boolean;
}

interface Extraction {
  status: "loading" | "ready" | "error";
  member?: AiSplitMember;
  error?: string;
  /** Whether "Add as tabs" includes this card. */
  add: boolean;
}

/** Splits the active card — a group card describing several characters — into one new tab per
 * person, in passes: "Find people" lists who's in the card and its lorebook, the user picks, then
 * each picked person is extracted by a request of their own (and can be redone on their own).
 * The group card itself stays exactly as it is; its lorebook and image can be copied over
 * unchanged, without AI. */
export function AiSplitGroupPanel({ onClose }: Props) {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const setAvatarPng = useCardStore((s) => s.setAvatarPng);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const lorebookCount = card?.character_book?.entries.length ?? 0;
  const [copyLorebook, setCopyLorebook] = useState(true);
  const [copyImage, setCopyImage] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [extraName, setExtraName] = useState("");
  const [isFinding, setIsFinding] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractions, setExtractions] = useState<Record<string, Extraction>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const busy = isFinding || isExtracting;
  const picked = candidates?.filter((c) => c.picked) ?? [];
  const cardPeopleCount = picked.filter((c) => c.source === "card").length;

  async function findPeople() {
    if (!activeProfile || !card) return;
    setIsFinding(true);
    setError(null);
    try {
      const people = await requestSplitPeople(activeProfile, [
        { role: "system", content: buildSplitPeopleSystemPrompt() },
        buildSplitPeopleUserTurn(card, lorebookEntriesForSplit(card)),
      ]);
      // Side characters that only live in the lorebook are offered, but not preselected.
      setCandidates(people.map((p) => ({ ...p, picked: p.source === "card" })));
      setExtractions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFinding(false);
    }
  }

  function togglePicked(index: number) {
    setCandidates((prev) => prev?.map((c, i) => (i === index ? { ...c, picked: !c.picked } : c)) ?? prev);
  }

  function addExtraName() {
    const name = extraName.trim();
    if (!name || candidates?.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCandidates((prev) => [...(prev ?? []), { name, role: "added by you", source: "card", picked: true }]);
    setExtraName("");
  }

  function patchExtraction(name: string, patch: Partial<Extraction>) {
    setExtractions((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { status: "loading", add: true }), ...patch } }));
  }

  /** One person's request. Errors stay on that person's row, so one failure doesn't stop the rest. */
  async function extract(person: Candidate, others: string[]) {
    if (!activeProfile || !card) return;
    patchExtraction(person.name, { status: "loading", error: undefined });
    try {
      const member = await requestSplitMember(activeProfile, [
        { role: "system", content: buildSplitMemberSystemPrompt(person.name, others) },
        buildSplitMemberUserTurn(card, lorebookEntriesForSplit(card, person.name)),
      ]);
      patchExtraction(person.name, { status: "ready", member, add: true });
    } catch (err) {
      patchExtraction(person.name, { status: "error", error: err instanceof Error ? err.message : String(err), add: false });
    }
  }

  async function extractPicked() {
    if (!activeProfile || picked.length === 0) return;
    setIsExtracting(true);
    setExtractions({});
    try {
      const names = picked.map((c) => c.name);
      await mapConcurrent(picked, concurrencyFor(activeProfile), (person) =>
        extract(person, names.filter((n) => n !== person.name)),
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function redo(person: Candidate) {
    setIsExtracting(true);
    try {
      await extract(person, picked.map((c) => c.name).filter((n) => n !== person.name));
    } finally {
      setIsExtracting(false);
    }
  }

  const ready = picked.filter((c) => extractions[c.name]?.status === "ready" && extractions[c.name].add);

  function handleApply() {
    if (!card) return;
    // Taken before newCard() switches the active tab away from the group card.
    const book = copyLorebook && card.character_book ? card.character_book : undefined;
    const world = copyLorebook ? card.extensions?.world : undefined;
    const image = copyImage ? avatarPng : null;
    for (const person of ready) {
      const member = extractions[person.name].member;
      if (!member) continue;
      newCard();
      updateCard({
        ...member,
        ...(book ? { character_book: structuredClone(book) } : {}),
        ...(world ? { extensions: { world } } : {}),
      });
      if (image) setAvatarPng(image);
    }
    onClose();
  }

  function renderExtraction(person: Candidate) {
    const ex = extractions[person.name];
    if (!ex) return null;
    if (ex.status === "loading") return <p className="field-hint">Extracting…</p>;
    const warning =
      ex.member && person.source === "card" && card ? splitMemberWarning(card, ex.member, cardPeopleCount) : null;
    return (
      <div className="consistency-fix">
        {ex.error && <p className="field-error">{ex.error}</p>}
        {warning === "short" && (
          <p className="field-error">Much shorter than expected — the AI probably left details out. Try “Redo”.</p>
        )}
        {warning === "long" && (
          <p className="field-error">
            Longer than the whole group card — check for repeated or made-up text, or try “Redo”.
          </p>
        )}
        {ex.member && (
          <label className="ai-lorebook-draft-entry">
            <input type="checkbox" checked={ex.add} onChange={(e) => patchExtraction(person.name, { add: e.target.checked })} />
            <div>
              <span className="ai-assist-draft-label">{ex.member.name}</span>
              <p className="ai-assist-draft-value">{ex.member.description}</p>
            </div>
          </label>
        )}
        <div className="consistency-fix-row">
          <button type="button" className="secondary" disabled={busy || !providerReady} onClick={() => void redo(person)}>
            Redo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Split Group Card</h3>
        <p className="field-hint">
          Splits “{card?.name || "this card"}” — one card describing several characters — into one card per person, each
          added as its own tab. First find the people, pick who to extract, then each one is extracted on their own. The
          group card itself stays unchanged.
        </p>

        <AiProviderSettings />

        <div className="ai-assist-field-checkboxes">
          {lorebookCount > 0 && (
            <label className="ai-assist-field-checkbox">
              <input type="checkbox" checked={copyLorebook} onChange={(e) => setCopyLorebook(e.target.checked)} />
              Copy its lorebook ({lorebookCount} entries) to every new card
            </label>
          )}
          {avatarPng && (
            <label className="ai-assist-field-checkbox">
              <input type="checkbox" checked={copyImage} onChange={(e) => setCopyImage(e.target.checked)} />
              Use its image for every new card
            </label>
          )}
        </div>

        {candidates && (
          <div className="ai-assist-draft">
            {candidates.length === 0 && <p className="ai-assist-draft-value">No people found — add names below.</p>}
            {candidates.map((person, i) => (
              <div key={person.name} className="ai-consistency-finding">
                <label className="field-inline">
                  <input type="checkbox" checked={person.picked} disabled={busy} onChange={() => togglePicked(i)} />
                  <strong>{person.name}</strong> — {person.role}
                  {person.source === "lorebook" && " (only in the lorebook)"}
                </label>
                {person.picked && renderExtraction(person)}
              </div>
            ))}
            <div className="consistency-fix-row">
              <input
                className="field-input"
                value={extraName}
                placeholder="Someone missing? Add a name"
                onChange={(e) => setExtraName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExtraName();
                }}
              />
              <button type="button" className="secondary" disabled={!extraName.trim() || busy} onClick={addExtraName}>
                Add
              </button>
            </div>
          </div>
        )}

        {!providerReady && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {error && <p className="field-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" disabled={!providerReady || !card || busy} onClick={() => void findPeople()}>
            {isFinding ? "Finding people…" : candidates ? "Find again" : "Find people"}
          </button>
          {candidates && (
            <button type="button" disabled={!providerReady || picked.length === 0 || busy} onClick={() => void extractPicked()}>
              {isExtracting ? "Extracting…" : `Extract ${picked.length} selected`}
            </button>
          )}
        </div>
        {busy && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes per person.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" onClick={handleApply} disabled={ready.length === 0 || busy}>
            Add {ready.length || ""} as tabs
          </button>
        </div>
      </div>
    </div>
  );
}
