import { useEffect, useState } from "react";
import { testConnection } from "../../io/aiClient";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useSettingsDialogStore } from "../../state/settingsDialogStore";

/** One line in every AI panel: which provider profile is used, and a way to change it. The profiles
 * themselves are edited under Settings → AI providers. */
export function AiProviderSettings() {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const ensureLoaded = useAiProviderConfigStore((s) => s.ensureLoaded);
  const openSettings = useSettingsDialogStore((s) => s.open);
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);
  const active = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;
  const ready = !!active?.baseUrl && !!active.model;

  return (
    <div className={ready ? "ai-provider-line" : "ai-provider-line missing"}>
      {ready ? (
        <span>
          AI: <strong>{active.label}</strong> <span className="field-hint">({active.model})</span>
        </span>
      ) : (
        <span className="field-warning">⚠ No AI provider set up yet.</span>
      )}
      <button type="button" className="link-button" onClick={() => openSettings("ai")}>
        {ready ? "Change…" : "Set one up…"}
      </button>
    </div>
  );
}

/** Provider profile selection/management + connection test — the "AI providers" page of the
 * settings. Self-contained via `useAiProviderConfigStore`. */
export function AiProviderProfilesEditor() {
  const configFile = useAiProviderConfigStore((s) => s.file);
  const setActiveProfile = useAiProviderConfigStore((s) => s.setActiveProfile);
  const addProfile = useAiProviderConfigStore((s) => s.addProfile);
  const updateProfile = useAiProviderConfigStore((s) => s.updateProfile);
  const removeProfile = useAiProviderConfigStore((s) => s.removeProfile);

  const activeProfile = configFile?.profiles.find((p) => p.id === configFile.activeProfileId) ?? null;

  const [newProfileLabel, setNewProfileLabel] = useState<string | null>(null); // null = form closed
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  function confirmAddProfile() {
    const label = newProfileLabel?.trim();
    if (!label) return;
    addProfile(label, { baseUrl: "", apiKey: "", model: "" });
    setNewProfileLabel(null);
  }

  async function handleTestConnection() {
    if (!activeProfile) return;
    setTestStatus("testing");
    setTestMessage(null);
    try {
      const content = await testConnection(activeProfile);
      setTestStatus("ok");
      setTestMessage(content.length > 100 ? `${content.slice(0, 100)}…` : content);
    } catch (err) {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="ai-assist-settings">
      <div className="ai-assist-settings-fields">
        <div className="ai-assist-profile-bar">
          <select
            className="field-input"
            value={configFile?.activeProfileId ?? ""}
            onChange={(e) => setActiveProfile(e.target.value || null)}
          >
            <option value="">— Select profile —</option>
            {configFile?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {newProfileLabel === null ? (
            <button type="button" className="secondary" onClick={() => setNewProfileLabel("")}>
              New profile…
            </button>
          ) : (
            <>
              <input
                className="field-input"
                type="text"
                placeholder="Profile name…"
                value={newProfileLabel}
                onChange={(e) => setNewProfileLabel(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={confirmAddProfile} disabled={!newProfileLabel.trim()}>
                Create
              </button>
              <button type="button" className="secondary" onClick={() => setNewProfileLabel(null)}>
                Cancel
              </button>
            </>
          )}

          {activeProfile && (
            <button
              type="button"
              className="danger"
              onClick={() => removeProfile(activeProfile.id)}
              title="Delete profile"
            >
              ✕
            </button>
          )}
        </div>

        {activeProfile ? (
          <>
            <label>
              Base URL
              <input
                className="field-input"
                value={activeProfile.baseUrl}
                onChange={(e) => updateProfile(activeProfile.id, { baseUrl: e.target.value })}
                placeholder="http://localhost:5001"
              />
            </label>
            <label>
              API key (optional)
              <input
                className="field-input"
                type="password"
                value={activeProfile.apiKey}
                onChange={(e) => updateProfile(activeProfile.id, { apiKey: e.target.value })}
              />
            </label>
            <label>
              Model
              <input
                className="field-input"
                value={activeProfile.model}
                onChange={(e) => updateProfile(activeProfile.id, { model: e.target.value })}
              />
            </label>
            <label>
              Temperature (optional)
              <input
                className="field-input"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={activeProfile.temperature ?? ""}
                onChange={(e) =>
                  updateProfile(activeProfile.id, {
                    temperature: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="Provider default"
              />
            </label>
            <label>
              Max tokens (optional)
              <input
                className="field-input"
                type="number"
                min="1"
                value={activeProfile.maxTokens ?? ""}
                onChange={(e) =>
                  updateProfile(activeProfile.id, {
                    maxTokens: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="Provider default"
              />
            </label>

            <label className="ai-assist-field-checkbox">
              <input
                type="checkbox"
                checked={activeProfile.parallel ?? false}
                onChange={(e) => updateProfile(activeProfile.id, { parallel: e.target.checked })}
              />
              Parallel requests — faster bulk operations (Condense all, Group lorebook) with cloud providers. Leave off
              for a local KoboldCpp, which handles one request at a time.
            </label>

            <div className="ai-assist-test-row">
              <button
                type="button"
                className="secondary"
                onClick={handleTestConnection}
                disabled={testStatus === "testing" || !activeProfile.baseUrl || !activeProfile.model}
              >
                {testStatus === "testing" ? "Testing…" : "Test connection"}
              </button>
              {testStatus === "ok" && <span className="ai-assist-test-ok">✓ {testMessage}</span>}
              {testStatus === "error" && <span className="field-error">✗ {testMessage}</span>}
            </div>
          </>
        ) : (
          <p className="field-hint">No profile selected. Create a new profile.</p>
        )}
      </div>
    </div>
  );
}
