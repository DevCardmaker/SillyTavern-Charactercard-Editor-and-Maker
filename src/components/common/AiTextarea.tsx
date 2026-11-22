import { useEffect, useMemo, useRef, useState } from "react";
import { requestFreeText } from "../../io/aiClient";
import type { AiContextKey } from "../../schema/aiContext";
import {
  buildInlineMessages,
  cleanInlineResult,
  INLINE_ACTIONS,
  inlineProblem,
  inlineTarget,
  keepSurroundingSpace,
  restoreCharMacro,
  type InlineActionId,
  type InlineTarget,
} from "../../schema/inlineAi";
import { promptText } from "../../schema/promptTexts";
import { wordDiff } from "../../schema/textDiff";
import { aiContextNow } from "../../state/aiContextNow";
import { activeAiProfileOrThrow } from "../../state/aiProviderConfigStore";
import { useCardStore } from "../../state/cardStore";
import { useCustomAiButtonsStore } from "../../state/customAiButtonsStore";
import { useSettingsDialogStore } from "../../state/settingsDialogStore";
import { MenuButton, type MenuItem } from "../layout/MenuButton";
import { insertIntoField } from "./TextContextMenu";

export interface AiFieldInfo {
  label: string;
  /** The card part this field is, so the AI Context doesn't send it twice. */
  contextKey?: AiContextKey;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
  /** Shows the quick-action bar above the field while it has focus. */
  ai?: AiFieldInfo;
}

interface Preview {
  /** The field when the request was sent — the result only fits that text. */
  text: string;
  target: InlineTarget;
  replacement: string;
  problem: string | null;
  action: InlineActionId | "custom";
  instruction: string;
  label: string;
}

/** A card text area with optional AI quick actions: they work on the selection, or the whole field
 * when nothing is selected, and always show old and new before anything changes. */
export function AiTextarea({ value, onChange, rows, placeholder, id, ai }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className={ai ? "ai-textarea" : undefined}>
      {ai && <InlineAiBar field={ref} info={ai} />}
      <textarea
        ref={ref}
        id={id}
        className="field-textarea"
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InlineAiBar({ field, info }: { field: React.RefObject<HTMLTextAreaElement | null>; info: AiFieldInfo }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const openSettings = useSettingsDialogStore((s) => s.open);
  const customButtons = useCustomAiButtonsStore((s) => s.buttons);
  const ensureButtonsLoaded = useCustomAiButtonsStore((s) => s.ensureLoaded);

  useEffect(() => {
    void ensureButtonsLoaded();
  }, [ensureButtonsLoaded]);

  /** `again` repeats a request on the same part of the field, as long as the field hasn't changed. */
  async function run(action: InlineActionId | "custom", instruction: string, label: string, again?: Preview) {
    const el = field.current;
    if (!el || busy) return;
    const text = el.value;
    const target = again && again.text === text ? again.target : inlineTarget(text, el.selectionStart, el.selectionEnd);
    setError(null);
    setPreview(null);
    if (!target.part.trim()) {
      setError("The field is empty — write something first, or use the AI Assistant to fill it.");
      return;
    }
    setBusy(label);
    try {
      const profile = await activeAiProfileOrThrow();
      const context = aiContextNow(info.contextKey);
      let problem: string | null = null;
      let result = "";
      // One more try when the code finds the answer unusable; small models often get it right then.
      for (let attempt = 0; attempt < 2; attempt++) {
        const messages = buildInlineMessages({
          fieldLabel: info.label,
          text,
          target,
          instruction,
          context,
          problem: problem ?? undefined,
        });
        const raw = await requestFreeText(profile, messages);
        result = restoreCharMacro(cleanInlineResult(raw, target.part), text, useCardStore.getState().card?.name ?? "");
        problem = inlineProblem(action, target.part, result);
        if (!problem) break;
      }
      const replacement = target.selected ? keepSurroundingSpace(target.part, result) : result;
      setPreview({ text, target, replacement, problem, action, instruction, label });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function accept() {
    const el = field.current;
    if (!el || !preview) return;
    if (el.value !== preview.text) {
      setError("The field was changed in the meantime — use Retry to work on the text as it is now.");
      return;
    }
    // Typed in like the keyboard does, so Ctrl+Z takes it back.
    el.focus();
    el.setSelectionRange(preview.target.start, preview.target.end);
    insertIntoField(el, preview.replacement);
    setPreview(null);
  }

  function runCustom() {
    const instruction = customText.trim();
    if (!instruction) return;
    void run("custom", instruction, "Custom");
  }

  const moreItems: (MenuItem | "separator")[] = [
    ...INLINE_ACTIONS.filter((a) => !a.main).map((a) => ({
      label: a.label,
      title: a.title,
      onSelect: () => void run(a.id, promptText(a.prompt), a.label),
    })),
    ...(customButtons && customButtons.length > 0
      ? [
          "separator" as const,
          ...customButtons.map((b) => ({
            label: b.label,
            title: b.instruction,
            onSelect: () => void run("custom", b.instruction, b.label),
          })),
        ]
      : []),
    "separator",
    { label: "Custom instruction…", onSelect: () => setCustomOpen(true) },
    { label: "Manage my buttons…", onSelect: () => openSettings("buttons") },
  ];

  const active = !!busy || !!preview || !!error || customOpen;

  return (
    <div className={active ? "inline-ai active" : "inline-ai"}>
      <div className="inline-ai-bar">
        {INLINE_ACTIONS.filter((a) => a.main).map((a) => (
          <button
            key={a.id}
            type="button"
            className="secondary inline-ai-button"
            title={`${a.title} — works on the selection, or the whole field`}
            disabled={!!busy}
            // Keep the text selection: the button mustn't take the focus on press.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void run(a.id, promptText(a.prompt), a.label)}
          >
            {a.label}
          </button>
        ))}
        <MenuButton label="More" items={moreItems} />
        {busy && <span className="field-hint inline-ai-busy">{busy}…</span>}
      </div>

      {customOpen && (
        <form
          className="inline-ai-custom"
          onSubmit={(e) => {
            e.preventDefault();
            runCustom();
          }}
        >
          <input
            type="text"
            autoFocus
            placeholder="What should the AI do with this text?"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
          <button type="submit" disabled={!!busy || !customText.trim()}>
            Run
          </button>
          <button type="button" className="secondary" onClick={() => setCustomOpen(false)}>
            ✕
          </button>
        </form>
      )}

      {error && (
        <p className="field-error inline-ai-error">
          {error}{" "}
          <button type="button" className="link-button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {preview && (
        <InlinePreview
          preview={preview}
          busy={!!busy}
          onAccept={accept}
          onReject={() => setPreview(null)}
          onRetry={() => void run(preview.action, preview.instruction, preview.label, preview)}
        />
      )}

    </div>
  );
}

function InlinePreview({
  preview,
  busy,
  onAccept,
  onReject,
  onRetry,
}: {
  preview: Preview;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const parts = useMemo(() => wordDiff(preview.target.part, preview.replacement), [preview]);
  return (
    <div className="inline-ai-preview">
      <div className="inline-ai-preview-head">
        <strong>{preview.label}</strong>
        <span className="field-hint">
          {preview.target.selected ? "selected part" : "whole field"} · <del>removed</del> <ins>added</ins>
        </span>
      </div>
      {preview.problem && <p className="field-warning">⚠ Check this: {preview.problem}.</p>}
      <div className="inline-ai-diff">
        {parts.map((part, i) =>
          part.kind === "removed" ? <del key={i}>{part.text}</del> : part.kind === "added" ? <ins key={i}>{part.text}</ins> : <span key={i}>{part.text}</span>,
        )}
      </div>
      <div className="inline-ai-preview-actions">
        <button type="button" onClick={onAccept} disabled={busy}>
          Accept
        </button>
        <button type="button" className="secondary" onClick={onReject} disabled={busy}>
          Reject
        </button>
        <button type="button" className="secondary" onClick={onRetry} disabled={busy}>
          Retry
        </button>
      </div>
    </div>
  );
}
