import { memo, useEffect, useMemo, useState } from "react";
import { useTokenCounter } from "../../hooks/useTokenCount";
import { confirmAction, confirmDiscardChanges } from "../../io/confirmDiscard";
import { openPresetFiles, saveActivePreset } from "../../io/stPresetIO";
import {
  addPrompt,
  canDeletePrompt,
  canEditPrompt,
  canTogglePrompt,
  countRegexScripts,
  deletePrompt,
  enabledPromptTexts,
  INJECTION_IN_CHAT,
  isSilentlyIgnored,
  listPromptRows,
  listUnplacedPrompts,
  movePrompt,
  placePrompt,
  promptLabel,
  promptWarning,
  removeRow,
  setPromptEnabled,
  updatePrompt,
  usesFallbackOrder,
  type PromptRow,
  type StPreset,
} from "../../schema/stPreset";
import { unbalancedMacroWarning } from "../../schema/warnings";
import { useStPresetStore } from "../../state/stPresetStore";
import { TextAreaField, TextField } from "../common/FormField";

interface Props {
  onError: (message: string) => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

function HowTo() {
  return (
    <div className="persona-howto">
      <strong>Getting it into SillyTavern</strong>
      <ol>
        <li>
          Presets are the <code>.json</code> files in SillyTavern's <code>data/&lt;user&gt;/OpenAI Settings</code>{" "}
          folder. If you can't reach that folder, use the export button next to SillyTavern's preset selection and import the saved
          file there again.
        </li>
        <li>
          SillyTavern keeps the preset in use in memory. After saving over its file, reload SillyTavern and switch to
          another preset and back.
        </li>
        <li>Don't press “Save preset” in SillyTavern before that, or its older copy overwrites your changes.</li>
      </ol>
    </div>
  );
}

interface RowProps {
  row: PromptRow;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  tokens: number | null;
  onSelect: (identifier: string) => void;
  onToggle: (position: number, enabled: boolean) => void;
  onMove: (from: number, to: number) => void;
}

/** Memoized so that typing into a prompt doesn't re-render dozens of other rows. */
const PromptListRow = memo(function PromptListRow({
  row,
  isSelected,
  isFirst,
  isLast,
  tokens,
  onSelect,
  onToggle,
  onMove,
}: RowProps) {
  const warning = promptWarning(row);
  const toggleable = canTogglePrompt(row.prompt);
  return (
    <li className={`preset-row${isSelected ? " active" : ""}${row.enabled ? "" : " off"}`}>
      <input
        type="checkbox"
        checked={row.enabled}
        disabled={!toggleable}
        title={toggleable ? "Send this prompt" : "SillyTavern always uses this one"}
        aria-label={`Send ${promptLabel(row.prompt, row.identifier)}`}
        onChange={(e) => onToggle(row.position, e.target.checked)}
      />
      <button type="button" className="preset-row-name" onClick={() => onSelect(row.identifier)}>
        {warning && <span className="preset-row-warning" title={warning}>⚠ </span>}
        {promptLabel(row.prompt, row.identifier)}
      </button>
      {row.prompt?.marker ? (
        <span className="preset-row-tokens" title="SillyTavern fills this in from the card, persona or chat">
          auto
        </span>
      ) : (
        tokens !== null && <span className="preset-row-tokens">{tokens}</span>
      )}
      <button
        type="button"
        className="preset-row-move"
        disabled={isFirst}
        aria-label="Move up"
        onClick={() => onMove(row.position, row.position - 1)}
      >
        ▲
      </button>
      <button
        type="button"
        className="preset-row-move"
        disabled={isLast}
        aria-label="Move down"
        onClick={() => onMove(row.position, row.position + 1)}
      >
        ▼
      </button>
    </li>
  );
});

/** Editing one open preset. Keyed by tab, so the selection belongs to the tab. */
function PresetEditor({ preset, onChange }: { preset: StPreset; onChange: (preset: StPreset) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const countTokens = useTokenCounter();
  const rows = useMemo(() => listPromptRows(preset), [preset]);
  const unplaced = useMemo(() => listUnplacedPrompts(preset), [preset]);

  // Counting all prompts on every keystroke would lag, so each distinct text is only counted once.
  const counted = useMemo(() => new Map<string, number>(), []);
  const count = (text: string): number | null => {
    if (!countTokens) return null;
    let tokens = counted.get(text);
    if (tokens === undefined) {
      tokens = countTokens(text);
      counted.set(text, tokens);
    }
    return tokens;
  };

  const texts = enabledPromptTexts(preset);
  const total = countTokens ? texts.reduce((sum, text) => sum + (count(text) ?? 0), 0) : null;
  const regexCount = countRegexScripts(preset);

  const row = rows.find((r) => r.identifier === selected);
  const prompt = row?.prompt ?? preset.prompts.find((p) => p.identifier === selected);
  const afterSelected = row?.position ?? rows.length - 1;

  // The rows are memoized, so these have to read the current preset through the store.
  const current = () => {
    const { presets, activeId } = useStPresetStore.getState();
    return presets.find((p) => p.id === activeId)?.preset ?? preset;
  };
  const handleToggle = useMemo(
    () => (position: number, enabled: boolean) => onChange(setPromptEnabled(current(), position, enabled)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange],
  );
  const handleMove = useMemo(
    () => (from: number, to: number) => onChange(movePrompt(current(), from, to)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange],
  );

  function handleAdd() {
    const identifier = crypto.randomUUID();
    onChange(addPrompt(preset, afterSelected, identifier));
    setSelected(identifier);
  }

  async function handleDelete(identifier: string, name: string) {
    if (await confirmAction(`Delete the prompt "${name}"? It stays in the backup of the file.`, "Delete prompt")) {
      onChange(deletePrompt(current(), identifier));
      setSelected(null);
    }
  }

  return (
    <div className="preset-layout">
      <aside className="preset-list-panel">
        <div className="preset-list-head">
          <button type="button" className="secondary" onClick={handleAdd}>
            Add prompt
          </button>
          {total !== null && (
            <span className="field-hint" title="Only what the preset itself sends. Comment macros count here too, so the real number is a little lower.">
              about {total.toLocaleString("en-US")} tokens on
            </span>
          )}
        </div>
        {usesFallbackOrder(preset) && (
          <p className="field-warning">
            ⚠ This file has no prompt list for SillyTavern's Chat Completion, so another one is shown. SillyTavern may
            not use it.
          </p>
        )}
        <ul className="preset-list">
          {rows.map((r, i) => (
            <PromptListRow
              key={`${r.identifier}-${i}`}
              row={r}
              isSelected={r.identifier === selected}
              isFirst={i === 0}
              isLast={i === rows.length - 1}
              tokens={count(r.prompt?.content ?? "")}
              onSelect={setSelected}
              onToggle={handleToggle}
              onMove={handleMove}
            />
          ))}
        </ul>
        {unplaced.length > 0 && (
          <details className="preset-unplaced">
            <summary>Not in the list ({unplaced.length})</summary>
            <p className="field-hint">In the file, but SillyTavern doesn't send these.</p>
            {unplaced.map((p) => (
              <div key={p.identifier} className="preset-unplaced-row">
                <button
                  type="button"
                  className="preset-row-name"
                  onClick={() => setSelected(p.identifier ?? null)}
                >
                  {promptLabel(p, p.identifier ?? "")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onChange(placePrompt(preset, p.identifier ?? "", afterSelected))}
                >
                  Add to list
                </button>
              </div>
            ))}
          </details>
        )}
      </aside>

      <div className="tab-panel preset-detail">
        {selected && row && !prompt && (
          <>
            <p className="field-warning">⚠ The prompt list refers to “{row.identifier}”, which isn't in this file.</p>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  onChange(removeRow(preset, row.position));
                  setSelected(null);
                }}
              >
                Remove from the list
              </button>
            </div>
          </>
        )}

        {prompt && selected && !canEditPrompt(prompt) && (
          <>
            <h3 className="preset-detail-title">{promptLabel(prompt, selected)}</h3>
            <p className="field-hint">
              SillyTavern fills this in from the card, persona or chat. You can only change where it sits in the list.
            </p>
          </>
        )}

        {prompt && selected && canEditPrompt(prompt) && (
          <>
            {isSilentlyIgnored(prompt) && (
              <div className="field-warning preset-fix">
                ⚠ SillyTavern never sends this prompt: it's marked as a system prompt, but isn't one of SillyTavern's
                own.
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onChange(updatePrompt(preset, selected, { system_prompt: false }))}
                >
                  Fix it
                </button>
              </div>
            )}
            <TextField
              label="Name"
              value={prompt.name ?? ""}
              onChange={(name) => onChange(updatePrompt(preset, selected, { name }))}
            />
            <div className="preset-settings">
              <label className="field">
                <span className="field-label">Role</span>
                <select
                  className="field-input"
                  value={prompt.role ?? "system"}
                  onChange={(e) => onChange(updatePrompt(preset, selected, { role: e.target.value }))}
                >
                  <option value="system">System</option>
                  <option value="user">User</option>
                  <option value="assistant">Assistant</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Sent</span>
                <select
                  className="field-input"
                  value={prompt.injection_position === INJECTION_IN_CHAT ? "chat" : "list"}
                  onChange={(e) =>
                    onChange(
                      updatePrompt(preset, selected, {
                        injection_position: e.target.value === "chat" ? INJECTION_IN_CHAT : 0,
                      }),
                    )
                  }
                >
                  <option value="list">At its place in the list</option>
                  <option value="chat">Inside the chat, at a depth</option>
                </select>
              </label>
              {prompt.injection_position === INJECTION_IN_CHAT && (
                <label className="field">
                  <span className="field-label">Depth</span>
                  <input
                    className="field-input"
                    type="number"
                    min={0}
                    value={prompt.injection_depth ?? 4}
                    onChange={(e) =>
                      onChange(updatePrompt(preset, selected, { injection_depth: Math.max(0, e.target.valueAsNumber || 0) }))
                    }
                  />
                </label>
              )}
            </div>
            <TextAreaField
              label="Text"
              value={prompt.content ?? ""}
              onChange={(content) => onChange(updatePrompt(preset, selected, { content }))}
              rows={18}
              showTokenCount
              warning={unbalancedMacroWarning(prompt.content ?? "")}
            />
          </>
        )}

        {prompt && selected && (
          <div className="preset-detail-actions">
            {row && (
              <label className="preset-position">
                Position
                <input
                  className="field-input"
                  type="number"
                  min={1}
                  max={rows.length}
                  key={row.position}
                  defaultValue={row.position + 1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onChange(movePrompt(preset, row.position, e.currentTarget.valueAsNumber - 1));
                  }}
                  onBlur={(e) => {
                    const to = e.target.valueAsNumber - 1;
                    if (Number.isFinite(to) && to !== row.position) onChange(movePrompt(preset, row.position, to));
                  }}
                />
                of {rows.length}
              </label>
            )}
            {canDeletePrompt(prompt) && (
              <button
                type="button"
                className="secondary"
                onClick={() => void handleDelete(selected, promptLabel(prompt, selected))}
              >
                Delete prompt
              </button>
            )}
          </div>
        )}

        {!selected && <p className="field-hint">Pick a prompt from the list to edit it.</p>}

        <p className="field-hint">
          Everything not shown here stays as it is in the file
          {regexCount > 0 && `, including ${regexCount} regex script${regexCount === 1 ? "" : "s"}`}.
        </p>
        <HowTo />
      </div>
    </div>
  );
}

/** The "Presets" mode: SillyTavern Chat Completion presets — switch prompts on and off, reorder and
 * edit them. Same shape as the other modes (toolbar → tab strip → editor). */
export function PresetWorkspace({ onError }: Props) {
  const presets = useStPresetStore((s) => s.presets);
  const activeId = useStPresetStore((s) => s.activeId);
  const updateActive = useStPresetStore((s) => s.updateActive);
  const setActive = useStPresetStore((s) => s.setActive);
  const close = useStPresetStore((s) => s.close);
  const active = presets.find((p) => p.id === activeId) ?? null;

  async function handleOpen() {
    try {
      const failed = await openPresetFiles();
      if (failed.length > 0) onError(failed.join(" — "));
    } catch (err) {
      onError(describe(err));
    }
  }

  async function handleSave(mode: "save" | "saveAs") {
    try {
      await saveActivePreset(mode);
    } catch (err) {
      onError(describe(err));
    }
  }

  async function handleClose(id: string, isDirty: boolean) {
    try {
      if (isDirty && !(await confirmDiscardChanges())) return;
      close(id);
    } catch (err) {
      onError(describe(err));
    }
  }

  // Ctrl+O/S act on presets while this mode is shown; the other modes' toolbars aren't mounted then.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        void handleOpen();
      } else if (key === "s") {
        e.preventDefault();
        void handleSave("save");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={() => void handleOpen()} title="Ctrl+O — several files open as separate tabs">
          Open…
        </button>
        <button type="button" onClick={() => void handleSave("save")} disabled={!active} title="Ctrl+S">
          Save
        </button>
        <button type="button" className="secondary" onClick={() => void handleSave("saveAs")} disabled={!active}>
          Save As…
        </button>
        {active && (
          <div className="toolbar-title">
            {fileNameOf(active.path)}
            {active.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </div>
        )}
      </div>

      {presets.length > 0 && (
        <div className="character-tab-bar">
          {presets.map((p) => (
            <div key={p.id} className={p.id === activeId ? "character-tab active" : "character-tab"}>
              <button type="button" className="character-tab-select" onClick={() => setActive(p.id)}>
                {fileNameOf(p.path).replace(/\.json$/i, "")}
                {p.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
              </button>
              <button
                type="button"
                className="character-tab-close"
                title="Close tab"
                onClick={() => void handleClose(p.id, p.isDirty)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {active ? (
        <PresetEditor key={active.id} preset={active.preset} onChange={updateActive} />
      ) : (
        <div className="empty-state">
          <p>No preset open. Open a SillyTavern Chat Completion preset (.json) to switch, reorder and edit its prompts.</p>
          <HowTo />
        </div>
      )}
    </>
  );
}
