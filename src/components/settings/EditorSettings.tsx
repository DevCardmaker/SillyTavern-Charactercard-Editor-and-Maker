import { useEffect } from "react";
import { useAppSettingsStore } from "../../state/appSettingsStore";

/** Looks of the text fields. */
export function EditorSettings() {
  const settings = useAppSettingsStore((s) => s.settings);
  const ensureLoaded = useAppSettingsStore((s) => s.ensureLoaded);
  const update = useAppSettingsStore((s) => s.update);
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return (
    <div className="settings-section">
      <label className="field-inline">
        <input type="checkbox" checked={settings?.highlight ?? true} onChange={(e) => void update({ highlight: e.target.checked })} />
        Colour dialogue, actions and macros in the text fields
      </label>
      <div className="settings-code hl-sample">
        <span className="hl-action">*leans against the counter*</span> <span className="hl-dialogue">"Nice to see you, </span>
        <span className="hl-dialogue hl-macro">{"{{user}}"}</span>
        <span className="hl-dialogue">."</span>
        {"\n"}
        <span className="hl-tag">{"<START>"}</span>
        {"\n"}
        <span className="hl-macro">{"{{char}}"}</span>: <span className="hl-dialogue">„Schön, dass du da bist.“</span>
      </div>
      <span className="field-hint">
        Dialogue in quotes (also „German“, “English” and «French» ones), *actions* between asterisks, {"{{macros}}"} and tags like
        {" <START>"}. Only colours — the text itself is unchanged.
      </span>
    </div>
  );
}
