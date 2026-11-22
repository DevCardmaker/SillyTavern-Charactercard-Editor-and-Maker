import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { defaultLibraryDir } from "../../io/appSettings";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { stProxyExample } from "../../schema/library";
import { useAiProviderConfigStore } from "../../state/aiProviderConfigStore";
import { useAppSettingsStore } from "../../state/appSettingsStore";

const ST_PROXY_DOCS = "https://docs.sillytavern.app/administration/config-yaml/";

/** Where the library lives, and the proxy for the editor's own internet requests. */
export function LibrarySettingsEditor() {
  const settings = useAppSettingsStore((s) => s.settings);
  const ensureLoaded = useAppSettingsStore((s) => s.ensureLoaded);
  const update = useAppSettingsStore((s) => s.update);
  const [fallbackDir, setFallbackDir] = useState("");
  const [proxy, setProxy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const aiFile = useAiProviderConfigStore((s) => s.file);
  const ensureAi = useAiProviderConfigStore((s) => s.ensureLoaded);
  useEffect(() => {
    void ensureAi();
  }, [ensureAi]);
  const example = stProxyExample(proxy ?? settings?.proxy ?? "", (aiFile?.profiles ?? []).map((p) => p.baseUrl));

  useEffect(() => {
    void ensureLoaded();
    void defaultLibraryDir().then(setFallbackDir);
  }, [ensureLoaded]);
  useEffect(() => {
    if (settings && proxy === null) setProxy(settings.proxy);
  }, [settings, proxy]);

  async function chooseFolder() {
    const dir = await open({ directory: true, defaultPath: settings?.libraryDir || fallbackDir || undefined });
    if (dir && !Array.isArray(dir)) await update({ libraryDir: dir });
  }

  const proxyValid = !proxy?.trim() || /^https?:\/\/[^\s/]+(:\d+)?\/?$/i.test(proxy.trim());

  return (
    <div className="settings-section">
      <div className="field">
        <span className="field-label">Library folder</span>
        <code className="settings-path">{settings?.libraryDir || fallbackDir}</code>
        <div className="settings-actions-left">
          <button type="button" className="secondary" onClick={() => void chooseFolder()}>
            Choose folder…
          </button>
          {settings?.libraryDir && (
            <button type="button" className="secondary" onClick={() => void update({ libraryDir: "" })}>
              Back to the default
            </button>
          )}
        </div>
        <span className="field-hint">A normal folder: subfolders are groups, “Lorebooks” holds lorebooks. Changing it doesn't move any files.</span>
      </div>

      <label className="field">
        <span className="field-label">Proxy (optional)</span>
        <input
          className="field-input"
          placeholder="http://192.168.0.10:8888"
          value={proxy ?? ""}
          onChange={(e) => setProxy(e.target.value)}
          onBlur={() => proxyValid && proxy !== null && void update({ proxy: proxy.trim() })}
        />
        {!proxyValid && <span className="field-error">An HTTP proxy address looks like http://host:port</span>}
        <span className="field-hint">
          For the editor's own internet requests — cloud AI providers and direct card links — e.g. a VPN container's HTTP
          proxy. Local addresses (this computer, your home network) never go through it.
        </span>
      </label>

      <div className="field">
        <span className="field-label">Downloads through SillyTavern</span>
        <span className="field-hint">
          Chub, JanitorAI and the other card sites are downloaded by SillyTavern itself, so they use SillyTavern's own proxy
          setting (<code>requestProxy</code> in its <code>config.yaml</code>), not the one above.{" "}
          <button type="button" className="link-button" onClick={() => void openUrl(ST_PROXY_DOCS)}>
            SillyTavern docs
          </button>
        </span>
        <span className="field-hint">
          In short: open <code>config.yaml</code> in SillyTavern's folder, find the <code>requestProxy:</code> block and make it look like
          this, then restart SillyTavern.
        </span>
        <pre className="settings-code">{example}</pre>
        <div className="settings-actions-left">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void writeText(example).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <ul className="field-hint settings-explain">
          <li>
            <code>url</code> — the proxy as SillyTavern's computer sees it: if the VPN container runs on the same machine as
            SillyTavern, use <code>127.0.0.1</code> instead of its network address.
          </li>
          <li>
            <code>bypass</code> — addresses that must not go through the proxy: your local model servers (taken from your AI
            profiles here). Only single addresses work there, no ranges like 192.168.0.0/24.
          </li>
          <li>Afterwards everything SillyTavern sends to the internet goes through the proxy — cloud AI included.</li>
        </ul>
      </div>
    </div>
  );
}
