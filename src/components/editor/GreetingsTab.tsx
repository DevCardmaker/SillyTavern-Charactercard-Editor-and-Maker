import { ListEditor } from "../common/ListEditor";
import { getGroupGreetingMode, GROUP_GREETING_MODE, withGroupGreetingMode } from "../../schema/groupGreetings";
import { unbalancedMacroWarning } from "../../schema/warnings";
import type { TabProps } from "./types";

export function GreetingsTab({ card, onChange }: TabProps) {
  const mode = getGroupGreetingMode(card.extensions);
  const groupGreetings = card.group_only_greetings ?? [];

  return (
    <div className="tab-panel">
      <ListEditor
        label="Alternate greetings"
        items={card.alternate_greetings}
        onChange={(alternate_greetings) => onChange({ alternate_greetings })}
        placeholder="Alternate first message..."
        multiline
        getItemWarning={unbalancedMacroWarning}
      />
      <ListEditor
        label="Group greetings"
        items={groupGreetings}
        onChange={(group_only_greetings) => onChange({ group_only_greetings })}
        placeholder="First message in a group chat..."
        multiline
        getItemWarning={unbalancedMacroWarning}
      />
      <p className="field-hint">
        Used instead of the greetings above when a new group chat starts. SillyTavern needs the Group Greetings extension for
        this; without it, they're ignored.
      </p>
      <div className="field-label">When a group chat starts</div>
      <label>
        <input
          type="radio"
          name="group-greeting-mode"
          checked={mode === GROUP_GREETING_MODE.RANDOM}
          onChange={() => onChange({ extensions: withGroupGreetingMode(card.extensions, GROUP_GREETING_MODE.RANDOM) })}
        />{" "}
        Pick one at random
      </label>{" "}
      <label>
        <input
          type="radio"
          name="group-greeting-mode"
          checked={mode === GROUP_GREETING_MODE.PICK}
          onChange={() => onChange({ extensions: withGroupGreetingMode(card.extensions, GROUP_GREETING_MODE.PICK) })}
        />{" "}
        Let me choose
      </label>
    </div>
  );
}
