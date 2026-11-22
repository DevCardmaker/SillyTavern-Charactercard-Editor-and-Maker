import { useEffect, useState } from "react";
import { EMPTY_ST_CONFIG, stListCharacters, stListGroups, stListPersonas, type StConfig } from "../../io/sillyTavernClient";
import { useSillyTavernStore } from "../../state/sillyTavernStore";

/** Where SillyTavern runs. Saved when a field is left; "Test connection" also saves first. */
export function StSettingsEditor() {
  const stored = useSillyTavernStore((s) => s.config);
  const ensureConfig = useSillyTavernStore((s) => s.ensureConfig);
  const saveConfig = useSillyTavernStore((s) => s.saveConfig);
  const [draft, setDraft] = useState<StConfig | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void ensureConfig();
  }, [ensureConfig]);
  useEffect(() => {
    if (stored && !draft) setDraft(stored);
  }, [stored, draft]);

  const config = draft ?? stored ?? EMPTY_ST_CONFIG;

  async function save(next: StConfig = config) {
    const cleaned = { ...next, baseUrl: next.baseUrl.trim().replace(/\/+$/, "") };
    setDraft(cleaned);
    if (JSON.stringify(cleaned) !== JSON.stringify(stored)) await saveConfig(cleaned);
    return cleaned;
  }

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    try {
      const cfg = await save();
      const characters = await stListCharacters(cfg);
      const groups = await stListGroups(cfg);
      const personas = await stListPersonas(cfg);
      setStatus({ ok: true, text: `Connected: ${characters.length} characters, ${groups.length} groups, ${personas.length} personas.` });
      void useSillyTavernStore.getState().refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  const field = (key: keyof StConfig) => ({
    value: config[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...config, [key]: e.target.value }),
    onBlur: () => void save(),
  });

  return (
    <div className="settings-section">
      <label className="field">
        <span className="field-label">Address</span>
        <input className="field-input" placeholder="http://127.0.0.1:8000" {...field("baseUrl")} />
        <span className="field-hint">
          The address you open SillyTavern with in the browser. From another computer, SillyTavern must allow it (listen and
          whitelist in its config.yaml).
        </span>
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">User (optional)</span>
          <input className="field-input" autoComplete="off" {...field("basicUser")} />
        </label>
        <label className="field">
          <span className="field-label">Password (optional)</span>
          <input className="field-input" type="password" autoComplete="off" {...field("basicPassword")} />
        </label>
      </div>
      <span className="field-hint">Only needed if SillyTavern asks for a login (basicAuthMode). Multi-user accounts aren't supported yet.</span>
      <div className="ai-assist-test-row">
        <button type="button" className="secondary" onClick={() => void handleTest()} disabled={testing || !config.baseUrl.trim()}>
          {testing ? "Testing…" : "Test connection"}
        </button>
        {status && <span className={status.ok ? "ai-assist-test-ok" : "field-error"}>{status.ok ? "✓" : "✗"} {status.text}</span>}
      </div>
    </div>
  );
}
