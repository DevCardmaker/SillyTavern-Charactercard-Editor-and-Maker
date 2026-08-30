import { useEffect, useState } from "react";
import { requestImagePrompt } from "../../io/aiClient";
import {
  AI_IMAGE_ART_STYLES,
  AI_IMAGE_MODEL_STYLES,
  type AiImageArtStyle,
  type AiImageModelStyle,
  imageArtStyleLabel,
  imageModelStyleLabel,
} from "../../schema/aiImagePrompt";
import { buildImagePromptSystemPrompt, buildImagePromptUserTurn } from "../../schema/aiPrompt";
import type { NormalizedCard } from "../../schema/normalize";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { AiProviderSettings } from "../editor/AiProviderSettings";

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

  const [style, setStyle] = useState<AiImageModelStyle>("general");
  const [artStyle, setArtStyle] = useState<AiImageArtStyle>("none");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
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
    setCopyStatus("idle");
    try {
      const prompt = await requestImagePrompt(activeProfile, [
        { role: "system", content: buildImagePromptSystemPrompt(style, artStyle) },
        buildImagePromptUserTurn(instruction, card),
      ]);
      setResult(prompt);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus("copied");
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
            <select className="field-input" value={style} onChange={(e) => setStyle(e.target.value as AiImageModelStyle)}>
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
              onChange={(e) => setArtStyle(e.target.value as AiImageArtStyle)}
            >
              {AI_IMAGE_ART_STYLES.map((s) => (
                <option key={s} value={s}>
                  {imageArtStyleLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {result && (
          <div className="ai-assist-draft">
            <textarea className="field-textarea field-monospace" value={result} readOnly rows={6} />
            <button type="button" className="secondary" onClick={handleCopy}>
              {copyStatus === "copied" ? "Copied ✓" : "Copy"}
            </button>
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
