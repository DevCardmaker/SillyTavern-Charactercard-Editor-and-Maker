import { useEffect } from "react";
import { useSettingsDialogStore, type SettingsSection } from "../../state/settingsDialogStore";
import { CustomAiButtonsEditor } from "../common/CustomAiButtonsEditor";
import { AiProviderProfilesEditor } from "../editor/AiProviderSettings";
import { PromptsSettings } from "../editor/PromptsSettings";
import { StSettingsEditor } from "./StSettingsEditor";

const SECTIONS: { id: SettingsSection; label: string; about: string }[] = [
  {
    id: "ai",
    label: "AI providers",
    about:
      "Profiles for the AI: a local model server (KoboldCpp, LM Studio, llama.cpp …) or a cloud API with your own key. The selected profile is used by every AI feature; switch quickly in the header.",
  },
  {
    id: "prompts",
    label: "Prompts",
    about: "Every instruction the AI gets, editable in a plain text file — and what was sent last.",
  },
  {
    id: "sillytavern",
    label: "SillyTavern",
    about: "Connect to your SillyTavern to open its characters, groups and personas here and send yours there.",
  },
  {
    id: "buttons",
    label: "My quick actions",
    about: "Your own buttons for the quick-action bar above the text fields.",
  },
];

/** All app-wide settings in one window, one page per topic. Later versions add SillyTavern, proxy and
 * library pages here. */
export function SettingsDialog() {
  const section = useSettingsDialogStore((s) => s.section);
  const open = useSettingsDialogStore((s) => s.open);
  const close = useSettingsDialogStore((s) => s.close);

  useEffect(() => {
    if (!section) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [section, close]);

  if (!section) return null;
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="modal-overlay">
      <div className="modal settings-modal">
        <div className="settings-layout">
          <nav className="settings-nav">
            <h3>Settings</h3>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === section ? "settings-nav-item active" : "settings-nav-item"}
                onClick={() => open(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="settings-page">
            <h3>{current.label}</h3>
            <p className="field-hint">{current.about}</p>
            {section === "ai" && <AiProviderProfilesEditor />}
            {section === "prompts" && <PromptsSettings />}
            {section === "buttons" && <CustomAiButtonsEditor />}
            {section === "sillytavern" && <StSettingsEditor />}
          </div>
        </div>
        <div className="modal-actions">
          <span className="field-hint">Changes are saved right away.</span>
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
