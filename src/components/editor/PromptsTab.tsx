import { TextAreaField } from "../common/FormField";
import { PromptFieldWithPresets } from "./PromptFieldWithPresets";
import { CHARACTER_NOTE_ROLES, type CharacterNoteRole, characterNotePatch, getCharacterNote } from "../../schema/characterNote";
import { unbalancedMacroWarning } from "../../schema/warnings";
import type { TabProps } from "./types";

export function PromptsTab({ card, onChange }: TabProps) {
  const note = getCharacterNote(card);
  return (
    <div className="tab-panel">
      <PromptFieldWithPresets
        field="system_prompt"
        label="System prompt"
        value={card.system_prompt}
        onChange={(system_prompt) => onChange({ system_prompt })}
        hint="Overrides the app's default system prompt, if set"
        warning={unbalancedMacroWarning(card.system_prompt)}
      />
      <PromptFieldWithPresets
        field="post_history_instructions"
        label="Post-History-Instructions"
        value={card.post_history_instructions}
        onChange={(post_history_instructions) => onChange({ post_history_instructions })}
        hint="Inserted after the chat history (jailbreak/reminder)"
        warning={unbalancedMacroWarning(card.post_history_instructions)}
      />
      <TextAreaField
        label="Character's note"
        value={note.prompt}
        onChange={(prompt) => onChange(characterNotePatch(card, { prompt }))}
        rows={3}
        hint="SillyTavern inserts this a few messages above the latest one — keeps the character on track in long chats. Keep it short; it's sent with every message."
        showTokenCount
        warning={unbalancedMacroWarning(note.prompt)}
      />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Note depth</span>
          <input
            className="field-input"
            type="number"
            min={0}
            value={note.depth}
            onChange={(e) => onChange(characterNotePatch(card, { depth: Math.max(0, Number(e.target.value) || 0) }))}
          />
        </label>
        <label className="field">
          <span className="field-label">Note role</span>
          <select
            className="field-input"
            value={note.role}
            onChange={(e) => onChange(characterNotePatch(card, { role: e.target.value as CharacterNoteRole }))}
          >
            {CHARACTER_NOTE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <span className="field-hint">Depth 0 = right after the latest message. SillyTavern's default: 4, system.</span>
      </div>
      <TextAreaField
        label="Creator notes"
        value={card.creator_notes}
        onChange={(creator_notes) => onChange({ creator_notes })}
        rows={6}
        hint="For reference only, not sent to the model"
      />
    </div>
  );
}
