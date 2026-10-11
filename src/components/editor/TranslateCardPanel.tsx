import { useEffect, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { requestKeysTranslation, requestNameTranslation, requestTranslation } from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import {
  buildTranslateKeysSystemPrompt,
  buildTranslateKeysUserTurn,
  buildTranslateNameSystemPrompt,
  buildTranslateNameUserTurn,
  buildTranslateSystemPrompt,
  buildTranslateUserTurn,
  translateNameNote,
} from "../../schema/aiPrompt";
import type { NormalizedCard } from "../../schema/normalize";
import {
  type AiEntryTranslation,
  applyTranslations,
  collectTranslateTexts,
  nameFitsScript,
  nameProblem,
  SCRIPT_PROBE,
  scriptOf,
  translationProblem,
  withOriginalSpacing,
} from "../../schema/translateCard";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { AiProviderSettings } from "./AiProviderSettings";

interface Props {
  onClose: () => void;
}

const LANGUAGE_SUGGESTIONS = ["Deutsch", "English", "Español", "Français", "Italiano", "Polski", "Português", "Русский", "日本語", "中文", "한국어"];

/** Translates the active card into any language the model knows — part by part (see
 * translateCard.ts), every part checked by the code and retried once if it looks broken; a part
 * that still fails keeps its original text and is listed. The result is a copy in a new tab. */
export function TranslateCardPanel({ onClose }: Props) {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const setAvatarPng = useCardStore((s) => s.setAvatarPng);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const count = useTokenCounter();

  const [language, setLanguage] = useState("");
  const [withLorebook, setWithLorebook] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizedCard | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const texts = card && count ? collectTranslateTexts(card, count) : [];
  const chunkCount = texts.reduce((sum, t) => sum + t.pieces.filter((p) => p.translate).length, 0);
  const entries = card?.character_book?.entries ?? [];
  const entryCount = withLorebook ? entries.filter((e) => e.content.trim()).length : 0;
  const canRun = providerReady && !!card && !!count && language.trim() !== "" && !isRunning;

  /** One request, checked; retried once if the check fails. Returns null if it still fails. */
  async function translateChecked<T>(request: () => Promise<T>, check: (result: T) => string | null): Promise<{ value: T | null; problem: string | null }> {
    let problem: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await request();
        problem = check(value);
        if (!problem) return { value, problem: null };
      } catch (err) {
        problem = err instanceof Error ? err.message : String(err);
      }
    }
    return { value: null, problem };
  }

  async function handleRun() {
    if (!activeProfile || !card || !count) return;
    const target = language.trim();
    setIsRunning(true);
    setError(null);
    setResult(null);
    setProblems([]);
    try {
      const outputs = texts.map((t) => t.pieces.map((p) => p.text));
      const chunkTasks = texts.flatMap((t, ti) =>
        t.pieces.flatMap((p, pi) => (p.translate ? [{ kind: "chunk" as const, ti, pi, label: t.label, text: p.text }] : [])),
      );
      const entryTasks = withLorebook
        ? entries.flatMap((e, ei) => (e.content.trim() ? [{ kind: "entry" as const, ei }] : []))
        : [];
      const translatedEntries: (AiEntryTranslation | null)[] = entries.map(() => null);
      const found: string[] = [];
      const tasks = [...chunkTasks, ...entryTasks];
      let done = 0;

      // First the name, on its own, so every part gets the same spelling (Дарья → Darja). Whether it
      // needs another script at all is decided by the code: a fixed test sentence shows which script
      // the target language uses; a name already in that script stays as it is, without asking.
      let name = card.name;
      if (card.name.trim()) {
        setProgress("Checking the name…");
        const probe = await translateChecked(
          () =>
            requestTranslation(activeProfile, [
              { role: "system", content: buildTranslateSystemPrompt(target, "a test sentence") },
              buildTranslateUserTurn(SCRIPT_PROBE),
            ]),
          (translated) => (scriptOf(translated) ? null : "no letters"),
        );
        const targetScript = probe.value !== null ? scriptOf(probe.value) : null;
        if (targetScript && !nameFitsScript(scriptOf(card.name), targetScript)) {
          const result = await translateChecked(
            () =>
              requestNameTranslation(activeProfile, [
                { role: "system", content: buildTranslateNameSystemPrompt(card.name, target, targetScript) },
                buildTranslateNameUserTurn(card.name),
              ]),
            (translated) => nameProblem(card.name, translated, targetScript),
          );
          if (result.value !== null) name = result.value.trim();
          else found.push(`Name: kept as it is (${result.problem})`);
        }
      }
      const nameNote = translateNameNote(card.name, name);
      setProgress(`Translating 0 of ${tasks.length} parts…`);

      await mapConcurrent(tasks, concurrencyFor(activeProfile), async (task) => {
        if (task.kind === "chunk") {
          const { value, problem } = await translateChecked(
            () =>
              requestTranslation(activeProfile, [
                { role: "system", content: buildTranslateSystemPrompt(target, task.label, nameNote) },
                buildTranslateUserTurn(task.text),
              ]),
            (translated) => translationProblem(task.text, translated),
          );
          if (value !== null) outputs[task.ti][task.pi] = withOriginalSpacing(task.text, value);
          else found.push(`${task.label}: one part kept in the original language (${problem})`);
        } else {
          // Text like card text; label and keys in a small request of their own. If only the keys
          // fail, the translated text is still used and the original keys stay.
          const entry = entries[task.ei];
          const label = `Lorebook “${entry.comment || entry.keys[0] || task.ei + 1}”`;
          const content = await translateChecked(
            () =>
              requestTranslation(activeProfile, [
                { role: "system", content: buildTranslateSystemPrompt(target, "lorebook", nameNote) },
                buildTranslateUserTurn(entry.content),
              ]),
            (translated) => translationProblem(entry.content, translated),
          );
          if (content.value === null) {
            found.push(`${label}: kept in the original language (${content.problem})`);
          } else {
            const keys = await translateChecked(
              () =>
                requestKeysTranslation(activeProfile, [
                  { role: "system", content: buildTranslateKeysSystemPrompt(target, nameNote) },
                  buildTranslateKeysUserTurn(entry),
                ]),
              (translated) => (translated.keys.some((k) => k.trim()) ? null : "no keys came back"),
            );
            if (!keys.value) found.push(`${label}: text translated, keys kept (${keys.problem})`);
            translatedEntries[task.ei] = {
              content: withOriginalSpacing(entry.content, content.value),
              comment: keys.value?.comment ?? entry.comment ?? "",
              keys: keys.value?.keys ?? entry.keys,
            };
          }
        }
        done++;
        setProgress(`Translating ${done} of ${tasks.length} parts…`);
      });

      setResult(applyTranslations(card, texts, outputs.map((o) => o.join("")), withLorebook ? translatedEntries : null, name));
      setProblems(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }

  function handleApply() {
    if (!result) return;
    const image = avatarPng;
    newCard();
    updateCard(result);
    if (image) setAvatarPng(image);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Translate Card</h3>
        <p className="field-hint">
          Translates “{card?.name || "this card"}” into another language — part by part, each part checked (macros like
          {" {{char}}"}, tags like {"<START>"}, length) and retried once if something looks wrong. The result opens as a
          copy in a new tab; the original stays unchanged. Names aren't translated, but written in the new language's
          script where it differs (e.g. Дарья → Darja).
        </p>

        <AiProviderSettings />

        <label className="field">
          <span className="field-label">Translate into</span>
          <input
            className="field-input"
            list="translate-languages"
            value={language}
            disabled={isRunning}
            placeholder="Any language, e.g. Deutsch, Japanese, Norsk"
            onChange={(e) => {
              setLanguage(e.target.value);
              setResult(null);
            }}
          />
          <datalist id="translate-languages">
            {LANGUAGE_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>

        {entries.length > 0 && (
          <label className="field-inline">
            <input type="checkbox" checked={withLorebook} disabled={isRunning} onChange={(e) => setWithLorebook(e.target.checked)} />
            Also translate the lorebook ({entries.length} entries — keys are translated too, names stay)
          </label>
        )}

        <p className="field-hint">
          {chunkCount + entryCount} part(s) to translate{texts.length > 0 ? ` from ${texts.map((t) => t.label).join(", ")}` : ""}.
        </p>

        {result && (
          <div className="ai-assist-draft">
            {problems.length > 0 ? (
              <>
                <p className="field-error">Some parts couldn't be translated cleanly and kept the original text:</p>
                {problems.map((p, i) => (
                  <p key={i} className="field-hint">
                    • {p}
                  </p>
                ))}
              </>
            ) : (
              <p className="field-hint">All parts translated.</p>
            )}
            {result.name !== card?.name && (
              <div className="ai-assist-draft-field">
                <span className="ai-assist-draft-label">Name</span>
                <p className="ai-assist-draft-value">
                  {card?.name} → {result.name}
                </p>
              </div>
            )}
            {(["description", "first_mes"] as const).map((field) =>
              result[field] ? (
                <div key={field} className="ai-assist-draft-field">
                  <span className="ai-assist-draft-label">{field === "description" ? "Description" : "First message"}</span>
                  <p className="ai-assist-draft-value">{result[field]}</p>
                </div>
              ) : null,
            )}
          </div>
        )}

        {!providerReady && <p className="field-hint">Please set a base URL and model in the provider settings.</p>}
        {error && <p className="field-error">{error}</p>}
        {progress && <p className="field-hint">{progress}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          {result ? (
            <button type="button" onClick={handleApply}>
              Add translated card as tab
            </button>
          ) : (
            <button type="button" disabled={!canRun} onClick={() => void handleRun()}>
              {isRunning ? "Translating…" : "Translate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
