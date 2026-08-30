import { ListEditor } from "../common/ListEditor";
import { unbalancedMacroWarning } from "../../schema/warnings";
import type { TabProps } from "./types";

export function GreetingsTab({ card, onChange }: TabProps) {
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
    </div>
  );
}
