import { TextAreaField } from "../common/FormField";
import { PromptFieldWithPresets } from "./PromptFieldWithPresets";
import { unbalancedMacroWarning } from "../../schema/warnings";
import type { TabProps } from "./types";

export function PromptsTab({ card, onChange }: TabProps) {
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
        label="Creator notes"
        value={card.creator_notes}
        onChange={(creator_notes) => onChange({ creator_notes })}
        rows={6}
        hint="For reference only, not sent to the model"
      />
    </div>
  );
}
