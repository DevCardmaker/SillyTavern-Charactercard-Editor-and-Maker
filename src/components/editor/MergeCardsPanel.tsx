import { useEffect, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { requestFieldPatch } from "../../io/aiClient";
import { condenseText } from "../../io/condenseText";
import { buildMergeSceneSystemPrompt, buildMergeSceneUserTurn } from "../../schema/aiPrompt";
import { assembleMerged, joinNames, mergeCardLorebooks, mergeSections, type MergeSection } from "../../schema/mergeCards";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

const TARGETS = [0, 0.75, 0.6, 0.5] as const;

/** "ai" = write new for the group, "empty" = leave empty, anything else = the id of the open tab to
 * take it from. */
type Choice = string;

/** Merges several open characters into one new group card (one {{char}} portraying all of them).
 * Each person's text is copied into its own section — optionally condensed with the same
 * section-by-section approach as the Condense panel, since several full cards in one quickly eat
 * the context. Scenario and first message can come from one of the cards or be written new for the
 * group. The source cards stay unchanged. */
export function MergeCardsPanel({ onClose }: Props) {
  const characters = useCardStore((s) => s.characters);
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const setAvatarPng = useCardStore((s) => s.setAvatarPng);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const count = useTokenCounter();

  const choices = characters.filter((c) => c.card.name.trim());
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set(choices.map((c) => c.id)));
  const [name, setName] = useState("");
  const [target, setTarget] = useState<(typeof TARGETS)[number]>(0);
  const [scenarioChoice, setScenarioChoice] = useState<Choice>("ai");
  const [firstChoice, setFirstChoice] = useState<Choice>("ai");
  const [exampleChoice, setExampleChoice] = useState<Choice>("empty");
  const [note, setNote] = useState("");
  const [mergeBooks, setMergeBooks] = useState(true);
  const [imageId, setImageId] = useState(() => choices.find((c) => c.avatarPng)?.id ?? "");
  /** AI results — cleared whenever an option they depend on changes. */
  const [condensed, setCondensed] = useState<MergeSection[] | null>(null);
  const [scene, setScene] = useState<{ scenario?: string; first_mes?: string } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [kept, setKept] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const picked = choices.filter((c) => pickedIds.has(c.id));
  const cards = picked.map((c) => c.card);
  const names = cards.map((c) => c.name.trim());
  const groupName = name.trim() || joinNames(names).replace(" and ", " & ");
  const tokens = (text: string) => (count ? count(text) : 0);
  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;

  const needsCondense = target > 0 && !condensed;
  const sceneFields = (["scenario", "first_mes"] as const).filter((f) =>
    (f === "scenario" ? scenarioChoice : firstChoice) === "ai",
  );
  const needsScene = sceneFields.length > 0 && !scene;
  const pendingAi = needsCondense || needsScene;

  function fromCard(choice: Choice, field: "scenario" | "first_mes" | "mes_example"): string {
    if (choice === "ai") return scene?.[field as "scenario" | "first_mes"] ?? "";
    if (choice === "empty") return "";
    const card = picked.find((c) => c.id === choice)?.card;
    return card ? card[field] : "";
  }

  const merged = assembleMerged(condensed ?? mergeSections(cards));
  const result = {
    name: groupName,
    description: merged.description,
    personality: merged.personality,
    scenario: fromCard(scenarioChoice, "scenario"),
    first_mes: fromCard(firstChoice, "first_mes"),
    mes_example: fromCard(exampleChoice, "mes_example"),
  };
  const rawMerged = assembleMerged(mergeSections(cards));
  const rawTokens = tokens(rawMerged.description) + tokens(rawMerged.personality);
  const resultTokens = tokens(result.description) + tokens(result.personality);
  const totalTokens = resultTokens + tokens(result.scenario) + tokens(result.first_mes) + tokens(result.mes_example);

  function togglePicked(id: string) {
    const next = new Set(pickedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickedIds(next);
    setCondensed(null);
    setScene(null);
    // A choice pointing at a card that's no longer part of the merge falls back to a safe default.
    if (!next.has(scenarioChoice) && !["ai", "empty"].includes(scenarioChoice)) setScenarioChoice("ai");
    if (!next.has(firstChoice) && !["ai", "empty"].includes(firstChoice)) setFirstChoice("ai");
    if (!next.has(exampleChoice) && exampleChoice !== "empty") setExampleChoice("empty");
    if (imageId && !next.has(imageId)) setImageId("");
  }

  async function runAi() {
    if (!activeProfile || !count) return;
    setIsRunning(true);
    setError(null);
    try {
      if (needsCondense) {
        const sections = mergeSections(cards);
        let keptSections = 0;
        const out: MergeSection[] = [];
        for (const [i, section] of sections.entries()) {
          setProgress(`Condensing ${section.name} (${i + 1} of ${sections.length})…`);
          const description = await condenseText(activeProfile, "description", section.description, target, count);
          const personality = section.personality
            ? await condenseText(activeProfile, "personality", section.personality, target, count)
            : { text: "", kept: 0 };
          keptSections += description.kept + personality.kept;
          out.push({ ...section, description: description.text, personality: personality.text });
        }
        setCondensed(out);
        setKept(keptSections);
      }
      if (needsScene) {
        setProgress("Writing the group scene…");
        const fixedScenario = scenarioChoice === "ai" ? undefined : fromCard(scenarioChoice, "scenario");
        const patch = await requestFieldPatch(activeProfile, sceneFields, [
          { role: "system", content: buildMergeSceneSystemPrompt(sceneFields, names) },
          buildMergeSceneUserTurn(cards, note, fixedScenario),
        ]);
        setScene({ scenario: String(patch.scenario ?? ""), first_mes: String(patch.first_mes ?? "") });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }

  function handleApply() {
    const book = mergeBooks ? mergeCardLorebooks(cards) : undefined;
    const image = picked.find((c) => c.id === imageId)?.avatarPng ?? null;
    newCard();
    updateCard({ ...result, ...(book ? { character_book: book } : {}) });
    if (image) setAvatarPng(image);
    onClose();
  }

  function choiceSelect(label: string, value: Choice, onChange: (v: Choice) => void, withAi: boolean) {
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <select className="field-input" value={value} onChange={(e) => onChange(e.target.value)} disabled={isRunning}>
          {withAi && <option value="ai">Write new for the group (AI)</option>}
          {picked.map((c) => (
            <option key={c.id} value={c.id}>
              From {c.card.name}
            </option>
          ))}
          <option value="empty">Leave empty</option>
        </select>
      </label>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Merge into Group Card</h3>
        <p className="field-hint">
          Combines the picked characters into one new card in which {"{{char}}"} portrays all of them — each person's text
          is copied into their own section. The original cards stay unchanged.
        </p>

        <AiProviderSettings />

        <div className="ai-assist-field-checkboxes">
          {choices.map((c) => (
            <label key={c.id} className="ai-assist-field-checkbox">
              <input type="checkbox" checked={pickedIds.has(c.id)} disabled={isRunning} onChange={() => togglePicked(c.id)} />
              {c.card.name}
            </label>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Name of the group card</span>
          <input className="field-input" value={name} placeholder={groupName} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">Shorten each person's text (AI, section by section — facts are kept)</span>
          <select
            className="field-input"
            value={target}
            disabled={isRunning}
            onChange={(e) => {
              setTarget(Number(e.target.value) as (typeof TARGETS)[number]);
              setCondensed(null);
            }}
          >
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {t === 0 ? "No — copy as it is" : `To about ${Math.round(t * 100)} %`}
              </option>
            ))}
          </select>
        </label>

        {choiceSelect("Scenario", scenarioChoice, (v) => {
          setScenarioChoice(v);
          setScene(null);
        }, true)}
        {choiceSelect("First message", firstChoice, (v) => {
          setFirstChoice(v);
          setScene(null);
        }, true)}
        {choiceSelect("Example dialogue", exampleChoice, setExampleChoice, false)}

        {sceneFields.length > 0 && (
          <input
            className="field-input"
            value={note}
            disabled={isRunning}
            placeholder="Optional note for the new scene, e.g. “They all meet at the lake house”"
            onChange={(e) => {
              setNote(e.target.value);
              setScene(null);
            }}
          />
        )}

        <div className="ai-assist-field-checkboxes">
          {cards.some((c) => c.character_book?.entries.length) && (
            <label className="ai-assist-field-checkbox">
              <input type="checkbox" checked={mergeBooks} onChange={(e) => setMergeBooks(e.target.checked)} />
              Merge their lorebooks
            </label>
          )}
          {picked.some((c) => c.avatarPng) && (
            <label className="ai-assist-field-checkbox">
              Image:
              <select className="field-input" value={imageId} onChange={(e) => setImageId(e.target.value)}>
                <option value="">None</option>
                {picked
                  .filter((c) => c.avatarPng)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.card.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {picked.length >= 2 && (
          <div className="ai-assist-draft">
            <p className="field-hint">
              Description + personality: {rawTokens} tokens copied
              {condensed ? ` → ${resultTokens} tokens condensed` : ""}. Whole card: about {totalTokens} tokens
              {pendingAi ? " (before the AI steps)" : ""}.
              {kept > 0 && ` ${kept} section(s) kept unshortened — the AI's version looked cut off.`}
            </p>
            {(["scenario", "first_mes"] as const).map((field) =>
              result[field] ? (
                <div key={field} className="ai-assist-draft-field">
                  <span className="ai-assist-draft-label">{field === "scenario" ? "Scenario" : "First message"}</span>
                  <p className="ai-assist-draft-value">{result[field]}</p>
                </div>
              ) : null,
            )}
            <div className="ai-assist-draft-field">
              <span className="ai-assist-draft-label">Description</span>
              <p className="ai-assist-draft-value">{result.description}</p>
            </div>
          </div>
        )}

        {!providerReady && pendingAi && (
          <p className="field-hint">Please set a base URL and model in the provider settings.</p>
        )}
        {error && <p className="field-error">{error}</p>}
        {progress && <p className="field-hint">{progress}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          {pendingAi ? (
            <button type="button" disabled={!providerReady || isRunning || picked.length < 2} onClick={() => void runAi()}>
              {isRunning ? "Working…" : "Run AI steps"}
            </button>
          ) : (
            <button type="button" disabled={picked.length < 2} onClick={handleApply}>
              Add group card as tab
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
