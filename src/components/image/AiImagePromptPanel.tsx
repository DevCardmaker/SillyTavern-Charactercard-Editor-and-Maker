import { useEffect, useState } from "react";
import { requestImagePrompt } from "../../io/aiClient";
import { readStored, storeChoice } from "../../io/storedChoice";
import {
  AI_IMAGE_ART_STYLES,
  AI_IMAGE_MODEL_STYLES,
  AI_IMAGE_RATINGS,
  type AiImageArtStyle,
  type AiImageModelStyle,
  type AiImageRating,
  applyImageRating,
  cleanImagePrompt,
  imageArtStyleLabel,
  imageModelStyleLabel,
  imageNegativePrompt,
  imageRatingLabel,
  imageSuggestedSize,
} from "../../schema/aiImagePrompt";
import { buildImagePromptSystemPrompt, buildImagePromptUserTurn } from "../../schema/aiPrompt";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "../editor/AiProviderSettings";

const STYLE_KEY = "image-prompt-style";
const ART_STYLE_KEY = "image-prompt-art-style";
const RATING_KEY = "image-prompt-rating";

interface Props {
  card: NormalizedCard;
  onClose: () => void;
}

/** One-shot image-prompt generator: no draft/refine-over-multiple-turns mechanic like the other
 * two AI-assist panels — there's a single text result to copy, so "change the instruction and
 * generate again" already covers refinement. Never touches the card (no `onChange`). */
export function AiImagePromptPanel({ card, onClose }: Props) {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureConfigLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [style, setStyle] = useState<AiImageModelStyle>(() => readStored(STYLE_KEY, AI_IMAGE_MODEL_STYLES) || "general");
  const [artStyle, setArtStyle] = useState<AiImageArtStyle>(() => readStored(ART_STYLE_KEY, AI_IMAGE_ART_STYLES) || "none");
  const [rating, setRating] = useState<AiImageRating>(() => readStored(RATING_KEY, AI_IMAGE_RATINGS) || "auto");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<{ prompt: string; negative: string; size: string } | null>(null);
  const [copied, setCopied] = useState<"prompt" | "negative" | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    ensureConfigLoaded();
  }, [ensureConfigLoaded]);

  const providerReady = !!activeProfile?.baseUrl && !!activeProfile.model;
  const canSend = providerReady && instruction.trim() !== "" && !isSending;

  async function handleGenerate() {
    if (!activeProfile || !canSend) return;
    setIsSending(true);
    setSendError(null);
    setCopied(null);
    try {
      const prompt = await requestImagePrompt(activeProfile, [
        { role: "system", content: buildImagePromptSystemPrompt(style, artStyle, rating) },
        buildImagePromptUserTurn(instruction, card),
      ]);
      setResult({
        prompt: applyImageRating(style, rating, cleanImagePrompt(style, prompt)),
        negative: imageNegativePrompt(style, artStyle, rating),
        size: imageSuggestedSize(style),
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopy(which: "prompt" | "negative") {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result[which]);
      setCopied(which);
    } catch {
      // Clipboard permissions can be flaky in a webview — the textarea below stays selectable
      // as a manual fallback, so this failure doesn't need its own error banner.
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal ai-assist-modal">
        <h3>Generate Image Prompt</h3>

        <AiProviderSettings />

        <div className="field-row">
          <label className="field">
            <span className="field-label">Target model</span>
            <select
              className="field-input"
              value={style}
              onChange={(e) => {
                const value = e.target.value as AiImageModelStyle;
                setStyle(value);
                storeChoice(STYLE_KEY, value);
              }}
            >
              {AI_IMAGE_MODEL_STYLES.map((s) => (
                <option key={s} value={s}>
                  {imageModelStyleLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Art style</span>
            <select
              className="field-input"
              value={artStyle}
              onChange={(e) => {
                const value = e.target.value as AiImageArtStyle;
                setArtStyle(value);
                storeChoice(ART_STYLE_KEY, value);
              }}
            >
              {AI_IMAGE_ART_STYLES.map((s) => (
                <option key={s} value={s}>
                  {imageArtStyleLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Rating</span>
            <select
              className="field-input"
              value={rating}
              onChange={(e) => {
                const value = e.target.value as AiImageRating;
                setRating(value);
                storeChoice(RATING_KEY, value);
              }}
            >
              {AI_IMAGE_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {imageRatingLabel(r)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {result && (
          <div className="ai-assist-draft">
            <span className="ai-assist-draft-label">Prompt</span>
            <textarea className="field-textarea field-monospace" value={result.prompt} readOnly rows={6} />
            <button type="button" className="secondary" onClick={() => handleCopy("prompt")}>
              {copied === "prompt" ? "Copied ✓" : "Copy"}
            </button>
            <span className="ai-assist-draft-label">Negative prompt</span>
            <textarea className="field-textarea field-monospace" value={result.negative} readOnly rows={3} />
            <button type="button" className="secondary" onClick={() => handleCopy("negative")}>
              {copied === "negative" ? "Copied ✓" : "Copy"}
            </button>
            <p className="field-hint">
              Suggested size: {result.size} (2:3, like SillyTavern avatars). The negative prompt only has an effect with CFG above 1. Turbo, Lightning and Rapid models run at CFG 1 and
              ignore it.
            </p>
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
            placeholder="e.g. “Close-up, action pose, dramatic lighting”"
            rows={2}
          />
          <button type="button" onClick={handleGenerate} disabled={!canSend}>
            {isSending ? "Generating…" : "Generate"}
          </button>
        </div>
        {isSending && (
          <p className="field-hint">
            Waiting for a response — with a local model running partly on CPU this can take several minutes.
          </p>
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
