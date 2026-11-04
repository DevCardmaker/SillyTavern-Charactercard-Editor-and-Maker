import { useEffect, useState } from "react";
import { requestGroupScene } from "../../io/aiClient";
import { buildGroupSceneSystemPrompt, buildGroupSceneUserTurn, groupScenePatch, resolveGroupScene } from "../../schema/aiGroupScene";
import { summarizeCardForAi } from "../../schema/aiPrompt";
import { memberName } from "../../schema/testChat";
import { FIELD_LENGTHS, type FieldLength, type OpeningPov } from "../../schema/writingOptions";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { usePersonaStore } from "../../state/personaStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

/** One shared opening scene for a group chat, cut into one group greeting per character. */
export function AiGroupScenePanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const updateSlotCard = useCardStore((s) => s.updateSlotCard);
  const personas = usePersonaStore((s) => s.characters);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [order, setOrder] = useState<string[]>(() => characters.map((c) => c.id));
  const [present, setPresent] = useState<Set<string>>(() => new Set(characters.map((c) => c.id)));
  const [situation, setSituation] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [length, setLength] = useState<FieldLength>("medium");
  const [pov, setPov] = useState<OpeningPov | "">("");
  const [scene, setScene] = useState<{ ids: string[]; texts: string[]; missing: string[] } | null>(null);
  const [replace, setReplace] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const cardOf = (id: string) => characters.find((c) => c.id === id)?.card;
  const nameOf = (id: string) => {
    const card = cardOf(id);
    return card ? memberName(card) : "";
  };
  const speakers = order.filter((id) => present.has(id) && cardOf(id));
  const canWrite = !!activeProfile?.baseUrl && !!activeProfile.model && speakers.length >= 2 && !!situation.trim() && !isSending;
  const sceneIds = scene?.ids ?? [];
  const hasGreetings = sceneIds.some((id) => (cardOf(id)?.group_only_greetings ?? []).some((g) => g.trim()));

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  function togglePresent(id: string) {
    const next = new Set(present);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPresent(next);
  }

  async function write() {
    if (!activeProfile || !canWrite) return;
    setIsSending(true);
    setError(null);
    setApplied(false);
    try {
      const persona = personas.find((p) => p.id === personaId)?.card;
      const names = speakers.map(nameOf);
      const messages = await requestGroupScene(activeProfile, [
        { role: "system", content: buildGroupSceneSystemPrompt(length, pov) },
        buildGroupSceneUserTurn(
          speakers.map((id) => summarizeCardForAi(cardOf(id)!)),
          situation,
          persona?.name.trim() ? { name: persona.name.trim(), description: persona.description } : undefined,
        ),
      ]);
      const { texts, missing } = resolveGroupScene(names, messages, persona?.name);
      setScene({ ids: speakers, texts, missing });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  function apply() {
    if (!scene || scene.texts.some((t) => !t.trim())) return;
    const names = scene.ids.map(nameOf);
    scene.ids.forEach((id, i) => {
      const card = cardOf(id);
      if (card) updateSlotCard(id, groupScenePatch(card, scene.texts[i].trim(), names, replace));
    });
    setApplied(true);
  }

  function editText(index: number, value: string) {
    if (!scene) return;
    setApplied(false);
    setScene({ ...scene, texts: scene.texts.map((t, i) => (i === index ? value : t)) });
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Group Greeting</h3>
        <p className="field-hint">
          One opening scene for a new group chat. SillyTavern shows one first message per member, so each character gets their
          part of the scene as a group greeting. Members you don't tick still greet as usual.
        </p>

        <AiProviderSettings />

        <div className="field-label">Who's there, in the order they speak</div>
        {order.map((id, index) => (
          <div className="consistency-fix-row" key={id}>
            <label className="field-inline" style={{ flex: 1 }}>
              <input type="checkbox" checked={present.has(id)} onChange={() => togglePresent(id)} />
              {present.has(id) ? `${speakers.indexOf(id) + 1}. ` : ""}
              {nameOf(id)}
            </label>
            <div className="list-editor-actions">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Move up">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} title="Move down">
                ↓
              </button>
            </div>
          </div>
        ))}

        <div className="consistency-fix-row">
          <label className="field-inline">
            You
            <select className="field-input" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              <option value="">No persona</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.card.name || "New persona"}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            Length per message
            <select className="field-input" value={length} onChange={(e) => setLength(e.target.value as FieldLength)}>
              {FIELD_LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l[0].toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            Point of view
            <select className="field-input" value={pov} onChange={(e) => setPov(e.target.value as OpeningPov | "")}>
              <option value="">As you ask</option>
              <option value="first">First person</option>
              <option value="second">Second person</option>
              <option value="third">Third person</option>
            </select>
          </label>
        </div>

        <div className="ai-assist-input-row">
          <textarea
            className="field-textarea"
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="What happens? e.g. “{{user}} comes home late and the three are waiting in the kitchen”"
            rows={3}
          />
          <button type="button" onClick={() => void write()} disabled={!canWrite}>
            {isSending ? "Writing…" : scene ? "Write again" : "Write scene"}
          </button>
        </div>
        {speakers.length < 2 && <p className="field-hint">Tick at least two characters.</p>}
        {isSending && (
          <p className="field-hint">Waiting for a response — with a local model running partly on CPU this can take several minutes.</p>
        )}
        {error && <p className="field-warning">⚠ {error}</p>}

        {scene && (
          <div className="ai-assist-draft">
            {scene.missing.length > 0 && (
              <span className="field-warning">⚠ Nothing came back for {scene.missing.join(", ")}: write it yourself or try again.</span>
            )}
            {scene.ids.map((id, i) => (
              <label key={id} className="list-editor">
                <span className="field-label">
                  {i + 1}. {nameOf(id)}
                </span>
                <textarea className="field-textarea" rows={4} value={scene.texts[i]} onChange={(e) => editText(i, e.target.value)} />
              </label>
            ))}
            {hasGreetings && (
              <div className="consistency-fix-row">
                <label className="field-inline">
                  <input type="radio" name="group-scene-existing" checked={replace} onChange={() => setReplace(true)} />
                  Replace their group greetings
                </label>
                <label className="field-inline">
                  <input type="radio" name="group-scene-existing" checked={!replace} onChange={() => setReplace(false)} />
                  Add to them
                </label>
              </div>
            )}
            {hasGreetings && !replace && (
              <span className="field-warning">
                ⚠ SillyTavern chooses for each card on its own, so parts of different scenes can end up in one chat.
              </span>
            )}
            <p className="field-hint">The order is noted in each card's Creator's Notes, since it's set in SillyTavern's member list.</p>
            <div className="modal-actions">
              <button type="button" disabled={scene.texts.some((t) => !t.trim())} onClick={apply}>
                Apply to the cards
              </button>
            </div>
            {applied && <p className="field-hint">✓ Added. The cards are marked as unsaved.</p>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
