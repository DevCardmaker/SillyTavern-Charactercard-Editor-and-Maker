import { useEffect, useMemo, type ReactNode } from "react";
import { ModelSwitcher, SettingsMenu } from "./GlobalTools";

interface Props {
  title: string;
  /** Second line, e.g. the file name. */
  meta?: ReactNode;
  dirty?: boolean;
  /** A picture next to the title (a persona's avatar). */
  thumbPng?: Uint8Array | null;
  /** Save and the mode's own menus. */
  children: ReactNode;
}

/** The top bar of the Lorebooks, Personas and Presets modes — the same shape as the characters
 * header: what's open on the left, its actions, then the AI profile and Settings. */
export function ModeHeader({ title, meta, dirty, thumbPng, children }: Props) {
  const url = useMemo(() => (thumbPng ? URL.createObjectURL(new Blob([thumbPng], { type: "image/png" })) : null), [thumbPng]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <header className="header-bar">
      <div className="header-card">
        {thumbPng !== undefined && (url ? <img className="header-avatar" src={url} alt="" /> : <div className="header-avatar header-avatar-empty" />)}
        <div className="header-card-text">
          <strong className="header-card-name">
            {title}
            {dirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </strong>
          {meta && <span className="header-card-meta">{meta}</span>}
        </div>
      </div>
      <div className="header-actions">
        <ModelSwitcher />
        {children}
        <SettingsMenu />
      </div>
    </header>
  );
}
