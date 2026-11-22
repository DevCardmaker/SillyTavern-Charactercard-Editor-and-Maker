import { useEffect } from "react";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useSettingsDialogStore } from "../../state/settingsDialogStore";
import { MenuButton } from "./MenuButton";

/** Which AI profile is in use, switchable in one click — so it's always clear which model answers. */
export function ModelSwitcher() {
  const file = useAiProviderConfigStore((s) => s.file);
  const ensureLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const setActiveProfile = useAiProviderConfigStore((s) => s.setActiveProfile);
  const openSettings = useSettingsDialogStore((s) => s.open);
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const profiles = file?.profiles ?? [];
  const active = profiles.find((p) => p.id === file?.activeProfileId) ?? null;
  if (profiles.length === 0) {
    return (
      <button type="button" className="secondary model-switcher" onClick={() => openSettings("ai")}>
        Set up AI…
      </button>
    );
  }
  return (
    <label className="model-switcher" title={active ? `AI: ${active.label} — ${active.model || "no model set"}` : "No AI profile selected"}>
      <span className="model-switcher-label">AI</span>
      <select value={file?.activeProfileId ?? ""} onChange={(e) => void setActiveProfile(e.target.value || null)}>
        {!active && <option value="">— none —</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The Settings menu — the same in every mode. */
export function SettingsMenu() {
  const openSettings = useSettingsDialogStore((s) => s.open);
  return (
    <MenuButton
      label="Settings"
      items={[
        { label: "AI providers…", onSelect: () => openSettings("ai") },
        { label: "Prompts…", onSelect: () => openSettings("prompts") },
        { label: "My quick actions…", onSelect: () => openSettings("buttons") },
      ]}
    />
  );
}

/** For the modes without the characters header: the model and the settings, top right. */
export function GlobalBar() {
  return (
    <div className="global-bar">
      <ModelSwitcher />
      <SettingsMenu />
    </div>
  );
}
