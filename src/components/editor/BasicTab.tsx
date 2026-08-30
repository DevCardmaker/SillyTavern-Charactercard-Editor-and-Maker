import { TextAreaField, TextField } from "../common/FormField";
import { combineWarnings, emptyFirstMesWarning, emptyNameWarning, unbalancedMacroWarning } from "../../schema/warnings";
import type { TabProps } from "./types";

export function BasicTab({ card, onChange }: TabProps) {
  return (
    <div className="tab-panel">
      <TextField
        label="Name"
        value={card.name}
        onChange={(name) => onChange({ name })}
        warning={emptyNameWarning(card.name)}
      />
      <TextAreaField
        label="Description"
        value={card.description}
        onChange={(description) => onChange({ description })}
        rows={8}
        showTokenCount
        warning={unbalancedMacroWarning(card.description)}
      />
      <TextAreaField
        label="Personality"
        value={card.personality}
        onChange={(personality) => onChange({ personality })}
        rows={4}
        showTokenCount
        warning={unbalancedMacroWarning(card.personality)}
      />
      <TextAreaField
        label="Scenario"
        value={card.scenario}
        onChange={(scenario) => onChange({ scenario })}
        rows={4}
        showTokenCount
        warning={unbalancedMacroWarning(card.scenario)}
      />
      <TextAreaField
        label="First message"
        value={card.first_mes}
        onChange={(first_mes) => onChange({ first_mes })}
        rows={6}
        showTokenCount
        warning={combineWarnings(emptyFirstMesWarning(card.first_mes), unbalancedMacroWarning(card.first_mes))}
      />
      <TextAreaField
        label="Example dialogue"
        value={card.mes_example}
        onChange={(mes_example) => onChange({ mes_example })}
        rows={8}
        hint="Usually formatted with <START> and {{user}}/{{char}}"
        showTokenCount
        warning={unbalancedMacroWarning(card.mes_example)}
      />
    </div>
  );
}
