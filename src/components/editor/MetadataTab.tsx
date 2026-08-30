import { useState } from "react";
import { TextField } from "../common/FormField";
import { ListEditor } from "../common/ListEditor";
import type { TabProps } from "./types";

/** Raw JSON editor for the `extensions` bag: unknown/vendor-specific fields the rest of the
 * form doesn't model explicitly. Keeps its own draft text so the user can type invalid JSON
 * transiently without losing the field's real (last-valid) value. */
function ExtensionsEditor({ card, onChange }: TabProps) {
  const [draft, setDraft] = useState(() => JSON.stringify(card.extensions, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange({ extensions: parsed });
    } catch {
      setError("Invalid JSON — the change won't be applied until it's valid again.");
    }
  }

  return (
    <label className="field">
      <span className="field-label">
        Extensions (raw data){error && <span className="field-error"> — {error}</span>}
      </span>
      <textarea
        className="field-textarea field-monospace"
        value={draft}
        rows={8}
        onChange={(e) => handleChange(e.target.value)}
      />
    </label>
  );
}

export function MetadataTab(props: TabProps) {
  const { card, onChange } = props;
  return (
    <div className="tab-panel">
      <TextField label="Creator" value={card.creator} onChange={(creator) => onChange({ creator })} />
      <TextField
        label="Card version"
        value={card.character_version}
        onChange={(character_version) => onChange({ character_version })}
      />
      <ListEditor label="Tags" items={card.tags} onChange={(tags) => onChange({ tags })} placeholder="tag" />
      <ExtensionsEditor {...props} />
    </div>
  );
}
