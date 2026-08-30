import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";
import { AvatarPanel } from "./components/image/AvatarPanel";
import { AiAssistPanel } from "./components/editor/AiAssistPanel";
import { BasicTab } from "./components/editor/BasicTab";
import { CharacterTabBar } from "./components/editor/CharacterTabBar";
import { GreetingsTab } from "./components/editor/GreetingsTab";
import { LorebookTab } from "./components/editor/LorebookTab";
import { MetadataTab } from "./components/editor/MetadataTab";
import { PromptsTab } from "./components/editor/PromptsTab";
import { Toolbar } from "./components/editor/Toolbar";
import type { TabProps } from "./components/editor/types";
import { RecentCardsList } from "./components/editor/RecentCardsList";
import { confirmDiscardChanges } from "./io/confirmDiscard";
import { openCardAtPath } from "./io/fileIO";
import { useCardStore } from "./state/cardStore";
import "./App.css";

const TABS: { id: string; label: string; Component: (props: TabProps) => React.JSX.Element }[] = [
  { id: "basic", label: "Basic", Component: BasicTab },
  { id: "prompts", label: "Prompts", Component: PromptsTab },
  { id: "greetings", label: "Greetings", Component: GreetingsTab },
  { id: "lorebook", label: "Lorebook", Component: LorebookTab },
  { id: "metadata", label: "Metadata", Component: MetadataTab },
];

function App() {
  const card = useCardStore((s) => s.card);
  const updateCard = useCardStore((s) => s.updateCard);
  const isDirty = useCardStore((s) => s.isDirty);
  const currentFilePath = useCardStore((s) => s.currentFilePath);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);

  const ActiveTab = TABS.find((t) => t.id === activeTab)?.Component ?? BasicTab;

  // Mirrors the toolbar's filename/dirty display into the native window title, so the card in
  // progress is distinguishable from the taskbar or Alt+Tab without focusing the window first.
  useEffect(() => {
    const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "New card";
    const dirtyMarker = isDirty ? "● " : "";
    getCurrentWindow().setTitle(`${dirtyMarker}${fileName} — SillyTavern Card Editor`);
  }, [currentFilePath, isDirty]);

  // Warn before the window closes with unsaved changes, same confirmation as New/Open.
  // destroy() (rather than close()) bypasses onCloseRequested entirely, so confirming doesn't
  // re-trigger this same handler and re-prompt.
  useEffect(() => {
    const win = getCurrentWindow();
    const describeError = (err: unknown) =>
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);

    const unlisten = win.onCloseRequested(async (event) => {
      if (!useCardStore.getState().characters.some((c) => c.isDirty)) return;
      event.preventDefault();
      try {
        if (await confirmDiscardChanges()) {
          await win.destroy();
        }
      } catch (err) {
        setError(`Error while closing: ${describeError(err)}`);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tauri intercepts OS-level file drag-and-drop at the webview level (dragDropEnabled defaults
  // to true), so this needs the Tauri drag-drop event, not HTML5 dragover/drop DOM events, which
  // never fire while that's on.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        setIsDragOver(true);
        return;
      }
      if (payload.type === "leave") {
        setIsDragOver(false);
        return;
      }
      // payload.type === "drop" — opens as a new tab, so there's nothing to discard-confirm here
      setIsDragOver(false);
      const [path] = payload.paths;
      if (!path) return;
      try {
        await openCardAtPath(path);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="app">
      {isDragOver && (
        <div className="drop-overlay">
          <p>Drop a file here to open it (.png / .json)</p>
        </div>
      )}

      <Toolbar onError={setError} onOpenAiAssist={() => setIsAiAssistOpen(true)} />
      <CharacterTabBar onError={setError} />

      {isAiAssistOpen && card && (
        <AiAssistPanel card={card} onChange={updateCard} onClose={() => setIsAiAssistOpen(false)} />
      )}

      {error && (
        <div className="error-banner">
          {error}
          <button type="button" className="secondary" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {!card ? (
        <div className="empty-state">
          <p>No card loaded. Create a new card or open an existing one.</p>
          <RecentCardsList onError={setError} />
        </div>
      ) : (
        <div className="editor-layout">
          <AvatarPanel />
          <div className="editor-main">
            <nav className="tab-bar">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={tab.id === activeTab ? "tab-button active" : "tab-button"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <ActiveTab card={card} onChange={updateCard} onError={setError} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
