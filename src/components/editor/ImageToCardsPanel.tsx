import { useEffect, useMemo, useState } from "react";
import {
  type AiProviderConfig,
  requestFieldPatch,
  requestImageCaption,
  requestImageDescription,
  requestImageIdeas,
} from "../../io/aiClient";
import { concurrencyFor, mapConcurrent } from "../../io/concurrency";
import { pickImageFile, toPngBytes, toVisionDataUrl } from "../../io/imageFile";
import { storyLanguageRetryHint } from "../../schema/aiPrompt";
import {
  buildImageCaptionMessages,
  buildImageCardMessages,
  buildImageDescribeMessages,
  buildImageIdeasMessages,
  buildImageSceneMessages,
  buildImageStructureMessages,
  type ImageDescription,
  type ImageIdea,
  type ImageUserRole,
  imageCardTargets,
  playedName,
} from "../../schema/imageToCards";
import { nameToUser, wrongLanguage } from "../../schema/storyToCards";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { CropDialog } from "../image/CropDialog";
import { AiProviderSettings } from "./AiProviderSettings";
import { GroupChatHint } from "./GroupChatHint";

interface Props {
  onClose: () => void;
}

interface PersonRow {
  who: string;
  looks: string;
  /** Gets a card of its own. */
  card: boolean;
}

type ImageCard = { name: string; description: string; personality: string; scenario: string; first_mes: string };

interface Result {
  status: "working" | "ready" | "error";
  progress?: string;
  card?: ImageCard;
  error?: string;
  add: boolean;
  languageWarning?: boolean;
}

type RoleChoice = "joins" | "known" | "plays";

const ROLE_LABELS: Record<RoleChoice, string> = {
  joins: "New — they meet you in this situation",
  known: "They already know you",
  plays: "You are one of the people in the picture",
};

const LANGUAGE_KEY = "imageToCards.language";
const DESCRIBER_KEY = "imageToCards.describer";

function readSetting(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience.
  }
}

/** One request, retried once — a long run shouldn't stop at a single bad reply. */
async function withRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch {
    return request();
  }
}

/** Creates character cards from a picture that tells a story (see imageToCards.ts): the picture
 * is described and corrected by the user, three ideas for the story behind it are offered, and
 * the chosen one becomes a card for each picked person, with an opening at the moment of the
 * picture. The picture becomes the avatar. */
export function ImageToCardsPanel({ onClose }: Props) {
  const newCard = useCardStore((s) => s.newCard);
  const updateCard = useCardStore((s) => s.updateCard);
  const setAvatarPng = useCardStore((s) => s.setAvatarPng);
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [image, setImage] = useState<{ fileName: string; bytes: Uint8Array; dataUrl: string } | null>(null);
  /** Whether the model saw the picture: after a failed description the picture isn't sent again. */
  const [vision, setVision] = useState<"unknown" | "ok" | "none">("unknown");
  const [scene, setScene] = useState("");
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [direction, setDirection] = useState("");
  const [ideas, setIdeas] = useState<ImageIdea[] | null>(null);
  const [shownTitles, setShownTitles] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [roleChoice, setRoleChoice] = useState<RoleChoice>("joins");
  const [playedLabel, setPlayedLabel] = useState("");
  const [language, setLanguage] = useState(() => readSetting(LANGUAGE_KEY));
  /** A separate profile that only describes the picture (e.g. JoyCaption); "" = the main profile. */
  const [describerId, setDescriberId] = useState(() => readSetting(DESCRIBER_KEY));
  /** The describing model's own text, shown for checking. */
  const [caption, setCaption] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [avatar, setAvatar] = useState<Uint8Array | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [busy, setBusy] = useState<"describe" | "ideas" | "cards" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(new Blob([image.bytes as BlobPart])) : null), [image]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const describer = configFile?.profiles.find((p) => p.id === describerId && p.id !== activeProfile?.id) ?? null;
  const writeLanguage = language.trim() || "English";
  // With a separate describer the later steps get its (uncensored) text only: the main model may
  // not see images at all, and where it does, its view would gloss over what the describer said.
  const imageUrl = vision === "ok" && image && !describer ? image.dataUrl : null;
  const description: ImageDescription = { scene, people: (people ?? []).map(({ who, looks }) => ({ who, looks })) };
  const idea = chosen !== null && ideas ? ideas[chosen] : null;
  const pickedPeople = (people ?? []).filter((p) => p.card).map(({ who, looks }) => ({ who, looks }));
  const role: ImageUserRole | null = idea
    ? roleChoice === "plays"
      ? playedLabel
        ? { kind: "plays", person: playedName(idea, playedLabel) ?? playedLabel, you: idea.you }
        : null
      : { kind: roleChoice, you: idea.you }
    : null;
  const targets = idea ? imageCardTargets(idea, pickedPeople, roleChoice === "plays" ? playedLabel || null : null) : [];
  const ready = targets.filter((t) => results[t.name]?.status === "ready" && results[t.name].add);

  function rememberLanguage(value: string) {
    setLanguage(value);
    writeSetting(LANGUAGE_KEY, value);
  }

  async function loadImage() {
    try {
      const file = await pickImageFile();
      if (!file) return;
      setImage({ ...file, dataUrl: await toVisionDataUrl(file.bytes) });
      setVision("unknown");
      setScene("");
      setPeople(null);
      setIdeas(null);
      setChosen(null);
      setResults({});
      setAvatar(null);
      setCaption(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function describe() {
    if (!activeProfile || !image) return;
    setBusy("describe");
    setError(null);
    try {
      let d: ImageDescription;
      if (describer) {
        // The describer looks; the main model only sorts its text into scene and people.
        const text = await requestImageCaption(describer, buildImageCaptionMessages(image.dataUrl));
        setCaption(text);
        d = await withRetry(() => requestImageDescription(activeProfile, buildImageStructureMessages(text, writeLanguage)));
      } else {
        d = await requestImageDescription(activeProfile, buildImageDescribeMessages(image.dataUrl, writeLanguage));
      }
      setVision("ok");
      setScene(d.scene);
      setPeople(d.people.map((p, i) => ({ ...p, card: i === 0 })));
      setIdeas(null);
      setChosen(null);
    } catch (err) {
      setVision("none");
      setPeople((prev) => prev ?? []);
      setError(
        `${describer ? `“${describer.label}”` : "The model"} couldn't describe the picture — it may not be able to see images or not be running (a vision model is needed, e.g. Cydonia with its vision module, or a cloud model with vision). ` +
          `You can describe the picture yourself below, or paste a description from an online service. (${err instanceof Error ? err.message : String(err)})`,
      );
    } finally {
      setBusy(null);
    }
  }

  function describeMyself() {
    setVision("none");
    setPeople((prev) => prev ?? []);
  }

  async function makeIdeas(fresh: boolean) {
    if (!activeProfile) return;
    setBusy("ideas");
    setError(null);
    try {
      const avoid = fresh ? shownTitles : [];
      const found = await withRetry(() =>
        requestImageIdeas(activeProfile, buildImageIdeasMessages(description, direction, avoid, imageUrl, writeLanguage), description.people),
      );
      setIdeas(found);
      setShownTitles((prev) => [...(fresh ? prev : []), ...found.map((i) => i.title)]);
      setChosen(found.length > 0 ? 0 : null);
      setResults({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function patchResult(name: string, patch: Partial<Result>) {
    setResults((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { status: "working", add: true }), ...patch } }));
  }

  /** The person the user plays is written {{user}}, by the name the idea gave them. */
  function toUser(text: string): string {
    if (!idea || roleChoice !== "plays" || !playedLabel) return text;
    const name = playedName(idea, playedLabel);
    if (!name) return text;
    const others = idea.cast.filter((c) => c.name !== name).map((c) => ({ name: c.name, aliases: [] }));
    return nameToUser(text, { name, aliases: [] }, others);
  }

  async function makeCard(config: AiProviderConfig, target: (typeof targets)[number]) {
    if (!idea || !role) return;
    patchResult(target.name, { status: "working", progress: "Writing the card…", error: undefined });
    try {
      // A reply in another language is written once more with the language said again.
      const inLanguage = async (ask: (hint: string) => Promise<Record<string, unknown>>, fields: string[]) => {
        const isWrong = (r: Record<string, unknown>) => wrongLanguage(fields.map((f) => String(r[f] ?? "")).join("\n"), writeLanguage);
        const first = await withRetry(() => ask(""));
        if (!isWrong(first)) return { reply: first, wrong: false };
        const second = await withRetry(() => ask(storyLanguageRetryHint(writeLanguage)));
        return { reply: second, wrong: isWrong(second) };
      };
      const card = await inLanguage(
        (hint) =>
          requestFieldPatch(config, ["description", "personality"], buildImageCardMessages(target, idea, description, role, imageUrl, writeLanguage, hint)),
        ["description", "personality"],
      );
      const fields = { description: String(card.reply.description ?? ""), personality: String(card.reply.personality ?? "") };
      patchResult(target.name, { progress: "Writing the opening…" });
      const opening = await inLanguage(
        (hint) =>
          requestFieldPatch(
            config,
            ["scenario", "first_mes"],
            buildImageSceneMessages(target.name, fields, idea, description, role, imageUrl, writeLanguage, hint),
          ),
        ["scenario", "first_mes"],
      );
      patchResult(target.name, {
        status: "ready",
        progress: undefined,
        add: true,
        languageWarning: card.wrong || opening.wrong,
        card: {
          name: target.name,
          description: toUser(fields.description),
          personality: toUser(fields.personality),
          scenario: toUser(String(opening.reply.scenario ?? "")),
          first_mes: toUser(String(opening.reply.first_mes ?? "")),
        },
      });
    } catch (err) {
      patchResult(target.name, { status: "error", progress: undefined, add: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function makeCards(only?: (typeof targets)[number]) {
    if (!activeProfile) return;
    setBusy("cards");
    setError(null);
    try {
      await mapConcurrent(only ? [only] : targets, concurrencyFor(activeProfile), (t) => makeCard(activeProfile, t));
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    try {
      const png = avatar ?? (image ? await toPngBytes(image.bytes) : null);
      for (const target of ready) {
        const card = results[target.name].card;
        if (!card) continue;
        newCard();
        updateCard(card);
        if (png) setAvatarPng(png);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function updateIdea(patch: Partial<ImageIdea>) {
    if (chosen === null || !ideas) return;
    setIdeas(ideas.map((it, i) => (i === chosen ? { ...it, ...patch } : it)));
    setResults({});
  }

  function updatePerson(index: number, patch: Partial<PersonRow>) {
    setPeople((list) => list?.map((p, i) => (i === index ? { ...p, ...patch } : p)) ?? null);
    setIdeas(null); // The facts changed: ideas built on the old ones would contradict them.
    setChosen(null);
    setResults({});
  }

  const isBusy = busy !== null;
  const showFacts = people !== null;

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Cards from an Image</h3>
        <p className="field-hint">
          For pictures that tell a story: the AI describes the picture — you correct what it got wrong — then suggests
          stories behind it. The chosen story becomes a card for each person you pick, starting at the moment of the
          picture, with the picture as avatar. Needs a model that can see images; otherwise describe the picture yourself.
        </p>

        <AiProviderSettings />

        <div className="consistency-fix-row">
          {previewUrl && <img src={previewUrl} alt="" style={{ maxHeight: 160, maxWidth: 240, objectFit: "contain" }} />}
          <div>
            {image && <p className="field-hint">{image.fileName}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" disabled={isBusy} onClick={() => void loadImage()}>
                {image ? "Other image…" : "Load image…"}
              </button>
              <button type="button" className="secondary" disabled={!image || !providerReady || isBusy} onClick={() => void describe()}>
                {busy === "describe" ? "Looking at the picture…" : showFacts && vision === "ok" ? "Describe again" : "Describe"}
              </button>
              {!showFacts && (
                <button type="button" className="secondary" disabled={isBusy} onClick={describeMyself}>
                  Describe it myself
                </button>
              )}
            </div>
          </div>
        </div>

        {(configFile?.profiles.length ?? 0) > 1 && (
          <label className="field">
            <span className="field-label">Describe the picture with</span>
            <select
              className="field-input"
              value={configFile?.profiles.some((p) => p.id === describerId) ? describerId : ""}
              disabled={isBusy}
              onChange={(e) => {
                setDescriberId(e.target.value);
                writeSetting(DESCRIBER_KEY, e.target.value);
              }}
            >
              <option value="">the profile above</option>
              {/* All profiles — also the active one: a profile just created is active, and hiding it
                  here made it look as if it hadn't been saved. */}
              {configFile?.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {describerId && describerId === activeProfile?.id && (
              <span className="field-warning">
                “{activeProfile.label}” is also chosen at the top. The profile at the top writes the stories and cards —
                choose your writing model there (e.g. Cydonia), and keep “{activeProfile.label}” here for describing.
              </span>
            )}
            <span className="field-hint">
              Optional: a model made for describing images, e.g. JoyCaption — more exact on poses and explicit pictures. The
              profile above then sorts its text and writes the stories.
            </span>
          </label>
        )}

        <label className="field">
          <span className="field-label">Write in</span>
          <input
            className="field-input"
            value={language}
            disabled={isBusy}
            placeholder="English — or type another language, e.g. Deutsch"
            onChange={(e) => rememberLanguage(e.target.value)}
          />
        </label>

        {showFacts && (
          <>
            <p className="field-hint">
              {vision === "ok"
                ? "What the AI sees — correct anything it got wrong (a fox taken for a cat, a colour changed by the light). These are the fixed facts every step keeps."
                : "Describe the picture: the place, and each person in it. These are the fixed facts every step keeps."}
            </p>
            {caption && (
              <details>
                <summary className="field-hint">The describing model's own text</summary>
                <p className="ai-assist-draft-value">{caption}</p>
              </details>
            )}
            <label className="field">
              <span className="field-label">The scene</span>
              <textarea
                className="field-textarea"
                rows={3}
                value={scene}
                disabled={isBusy}
                onChange={(e) => {
                  setScene(e.target.value);
                  setIdeas(null);
                  setChosen(null);
                  setResults({});
                }}
              />
            </label>
            <div className="ai-assist-draft">
              <span className="field-label">People in the picture</span>
              {people.length === 0 && <p className="field-hint">No one — the ideas will invent a character for the place, or a narrator.</p>}
              {people.map((p, i) => (
                <div key={i} className="ai-consistency-finding">
                  <label className="field-inline">
                    <input type="checkbox" checked={p.card} disabled={isBusy} onChange={() => updatePerson(i, { card: !p.card })} />
                    gets a card
                  </label>
                  <input className="field-input" value={p.who} disabled={isBusy} onChange={(e) => updatePerson(i, { who: e.target.value })} />
                  <textarea
                    className="field-textarea"
                    rows={2}
                    value={p.looks}
                    disabled={isBusy}
                    onChange={(e) => updatePerson(i, { looks: e.target.value })}
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={isBusy}
                    onClick={() => {
                      setPeople((list) => list?.filter((_, j) => j !== i) ?? null);
                      setIdeas(null);
                      setChosen(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={isBusy}
                onClick={() => setPeople((list) => [...(list ?? []), { who: "", looks: "", card: (list ?? []).length === 0 }])}
              >
                Add a person
              </button>
            </div>

            <input
              className="field-input"
              value={direction}
              disabled={isBusy}
              placeholder="Optional direction for the ideas, e.g. “an old friend I haven't seen in years”, “a star fleeing the press”, “horror”"
              onChange={(e) => setDirection(e.target.value)}
            />
            <div className="modal-actions">
              {/* One button: first "Suggest stories", then "3 new ideas", which tells the model what it
                  already suggested — asking again without that brought back the same ideas. */}
              <button
                type="button"
                className="secondary"
                disabled={!providerReady || isBusy || (!scene.trim() && people.length === 0)}
                onClick={() => void makeIdeas(!!ideas)}
                title={ideas ? "Three ideas clearly different from all suggested so far" : undefined}
              >
                {busy === "ideas" ? "Thinking up stories…" : ideas ? "3 new ideas" : "Suggest stories"}
              </button>
            </div>
          </>
        )}

        {ideas && ideas.length > 0 && (
          <div className="ai-assist-draft">
            {ideas.map((it, i) => (
              <label key={i} className="ai-lorebook-draft-entry">
                <input type="radio" name="image-idea" checked={chosen === i} disabled={isBusy} onChange={() => { setChosen(i); setResults({}); }} />
                <div>
                  <strong>{it.title}</strong>
                  <p className="ai-assist-draft-value">{it.story}</p>
                  <p className="field-hint">
                    {it.cast.map((c) => `${c.name}${c.role === "narrator" ? " (narrator)" : ""}${c.image_person ? ` — ${c.image_person}` : ""}`).join(" · ")}
                    {it.you && ` · You: ${it.you}`}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        {idea && (
          <>
            <label className="field">
              <span className="field-label">The story (edit it as you like)</span>
              <textarea className="field-textarea" rows={4} value={idea.story} disabled={isBusy} onChange={(e) => updateIdea({ story: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">You in this situation</span>
              <input className="field-input" value={idea.you} disabled={isBusy} onChange={(e) => updateIdea({ you: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">The characters and you</span>
              <select className="field-input" value={roleChoice} disabled={isBusy} onChange={(e) => { setRoleChoice(e.target.value as RoleChoice); setResults({}); }}>
                {(Object.keys(ROLE_LABELS) as RoleChoice[])
                  .filter((k) => k !== "plays" || (people ?? []).length > 0)
                  .map((k) => (
                    <option key={k} value={k}>
                      {ROLE_LABELS[k]}
                    </option>
                  ))}
              </select>
            </label>
            {roleChoice === "plays" && (
              <label className="field">
                <span className="field-label">You are</span>
                <select className="field-input" value={playedLabel} disabled={isBusy} onChange={(e) => { setPlayedLabel(e.target.value); setResults({}); }}>
                  <option value="">— pick a person —</option>
                  {(people ?? []).map((p) => (
                    <option key={p.who} value={p.who}>
                      {p.who}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targets.length === 0 && <p className="field-hint">No one to write a card for — tick “gets a card” at a person above.</p>}
            {targets.map((t) => {
              const r = results[t.name];
              return (
                <div key={t.name} className="ai-consistency-finding">
                  <strong>{t.name}</strong>
                  {t.narrator && <span className="field-hint"> (narrator)</span>}
                  {r?.status === "working" && <p className="field-hint">{r.progress ?? "Waiting…"}</p>}
                  {r?.error && <p className="field-error">{r.error}</p>}
                  {r?.languageWarning && (
                    <p className="field-hint">The model wrote this card (partly) in another language than “{writeLanguage}”, also on a second try.</p>
                  )}
                  {r?.card && (
                    <label className="ai-lorebook-draft-entry">
                      <input type="checkbox" checked={r.add} onChange={(e) => patchResult(t.name, { add: e.target.checked })} />
                      <div>
                        <span className="ai-assist-draft-label">Description</span>
                        <p className="ai-assist-draft-value">{r.card.description}</p>
                        <span className="ai-assist-draft-label">First message</span>
                        <p className="ai-assist-draft-value">{r.card.first_mes}</p>
                      </div>
                    </label>
                  )}
                  {r && r.status !== "working" && (
                    <button type="button" className="secondary" disabled={isBusy || !providerReady} onClick={() => void makeCards(t)}>
                      Rewrite
                    </button>
                  )}
                </div>
              );
            })}
            <div className="modal-actions">
              <button type="button" disabled={!providerReady || isBusy || !role || targets.length === 0} onClick={() => void makeCards()}>
                {busy === "cards" ? "Writing…" : `Create ${targets.length} card${targets.length === 1 ? "" : "s"}`}
              </button>
              {image && (
                <button type="button" className="secondary" disabled={isBusy} onClick={() => setIsCropping(true)}>
                  {avatar ? "Crop again…" : "Crop avatar…"}
                </button>
              )}
            </div>
          </>
        )}

        {!providerReady && <p className="field-hint">Please set a base URL and model in the provider settings.</p>}
        {error && <p className="field-error">{error}</p>}

        {targets.length > 1 && <GroupChatHint />}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Discard
          </button>
          <button type="button" onClick={() => void handleApply()} disabled={ready.length === 0 || isBusy}>
            Add {ready.length || ""} as tabs
          </button>
        </div>

        {isCropping && image && (
          <CropDialog
            sourceBytes={image.bytes}
            onCancel={() => setIsCropping(false)}
            onConfirm={(png) => {
              setAvatar(png);
              setIsCropping(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
