import { useState } from "react";
import { openPromptsFile } from "../../io/promptFile";
import { usePromptFileStore } from "../../state/promptFileStore";

/** The prompts file (customisable AI instructions) and a read-only view of what the last AI
 * request sent — shown in every AI window under the provider settings. */
export function PromptsSettings() {
  const status = usePromptFileStore((s) => s.status);
  const loadError = usePromptFileStore((s) => s.error);
  const lastMessages = usePromptFileStore((s) => s.lastMessages);
  const reload = usePromptFileStore((s) => s.reload);
  const [showLast, setShowLast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState(false);

  const custom = status?.overridden.length ?? 0;
  const summary = !status?.exists
    ? "built-in"
    : custom === 0
      ? "built-in (prompts file unchanged)"
      : `${custom} custom section${custom === 1 ? "" : "s"}`;

  async function handleOpen() {
    setError(null);
    try {
      await openPromptsFile();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReload() {
    await reload();
    setReloaded(true);
    setTimeout(() => setReloaded(false), 2000);
  }

  return (
    <details className="ai-assist-settings">
      <summary>Prompts: {summary}</summary>
      <div className="ai-assist-settings-fields">
        <p className="field-hint">
          The instructions the AI gets come from a text file you can edit — change a section, save, then “Reload
          prompts”. Sections you delete fall back to the built-in text.
          {status?.path && ` File: ${status.path}`}
        </p>
        <div className="ai-assist-profile-bar">
          <button type="button" className="secondary" onClick={() => void handleOpen()}>
            {status?.exists ? "Edit prompts file" : "Create prompts file"}
          </button>
          <button type="button" className="secondary" onClick={() => void handleReload()}>
            {reloaded ? "Reloaded ✓" : "Reload prompts"}
          </button>
          <button type="button" className="secondary" disabled={!lastMessages} onClick={() => setShowLast((v) => !v)}>
            {showLast ? "Hide last prompt" : "Show last prompt"}
          </button>
        </div>
        {status && status.unknown.length > 0 && (
          <p className="field-error">
            Unknown section(s) in the prompts file, ignored: {status.unknown.join(", ")} — check the spelling after ###.
          </p>
        )}
        {(error || loadError) && <p className="field-error">{error ?? loadError}</p>}
        {showLast && lastMessages && (
          <div className="ai-assist-draft">
            {lastMessages.map((m, i) => (
              <div key={i} className="ai-assist-draft-field">
                <span className="ai-assist-draft-label">{m.role}</span>
                <pre className="prompt-preview">{m.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
