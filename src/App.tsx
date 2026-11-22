import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { TextContextMenu } from "./components/common/TextContextMenu";
import { AvatarTab } from "./components/editor/AvatarTab";
import { BasicTab } from "./components/editor/BasicTab";
import { GreetingsTab } from "./components/editor/GreetingsTab";
import { LorebookTab } from "./components/editor/LorebookTab";
import { MetadataTab } from "./components/editor/MetadataTab";
import { PromptsTab } from "./components/editor/PromptsTab";
import type { TabProps } from "./components/editor/types";
import { RecentCardsList } from "./components/editor/RecentCardsList";
import { HeaderBar } from "./components/layout/HeaderBar";
import { RecentGroupsSection } from "./components/layout/RecentPanel";
import { LeftSidebar, type AppMode } from "./components/layout/LeftSidebar";
import { RightSidebar, type ToolId } from "./components/layout/RightSidebar";
import { Sidebar, SidebarRail } from "./components/layout/Sidebar";
import { LorebookWorkspace } from "./components/lorebook/LorebookWorkspace";
import { PersonaWorkspace } from "./components/persona/PersonaWorkspace";
import { PresetWorkspace } from "./components/preset/PresetWorkspace";
import { confirmDiscardChanges } from "./io/confirmDiscard";
import { openCardAtPath } from "./io/fileIO";
import { openLorebookPaths } from "./io/lorebookIO";
import { openPresetPaths } from "./io/stPresetIO";
import { readStored, storeChoice } from "./io/storedChoice";
import { useCardStore } from "./state/cardStore";
import { useLorebookStore } from "./state/lorebookStore";
import { usePersonaStore } from "./state/personaStore";
import { usePromptFileStore } from "./state/promptFileStore";
import { useStPresetStore } from "./state/stPresetStore";
import "./App.css";

const TABS: { id: string; label: string; Component: (props: TabProps) => React.JSX.Element }[] = [
  { id: "basic", label: "Basic", Component: BasicTab },
  { id: "avatar", label: "Avatar", Component: AvatarTab },
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
  // Characters vs. standalone Lorebooks/Personas/Presets. All stores live on regardless, so switching
  // never loses open tabs or unsaved work elsewhere. The ref is for the once-registered Tauri
  // listeners below, which would otherwise only ever see the initial mode.
  const [mode, setMode] = useState<AppMode>("characters");
  const [isLeftOpen, setIsLeftOpen] = useState(() => readStored("sidebar-left", ["open", "closed"]) !== "closed");
  const [isRightOpen, setIsRightOpen] = useState(() => readStored("sidebar-right", ["open", "closed"]) === "open");
  const [activeTool, setActiveTool] = useState<ToolId>("snapshots");
  const [openedTools, setOpenedTools] = useState<ToolId[]>(() => (isRightOpen ? ["snapshots"] : []));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const activeLorebook = useLorebookStore((s) => s.lorebooks.find((l) => l.id === s.activeId) ?? null);
  const personaPath = usePersonaStore((s) => s.currentFilePath);
  const personaDirty = usePersonaStore((s) => s.isDirty);
  const activePreset = useStPresetStore((s) => s.presets.find((p) => p.id === s.activeId) ?? null);

  const ActiveTab = TABS.find((t) => t.id === activeTab)?.Component ?? BasicTab;

  function setLeftOpen(open: boolean) {
    setIsLeftOpen(open);
    storeChoice("sidebar-left", open ? "open" : "closed");
  }

  function setRightOpen(open: boolean) {
    setIsRightOpen(open);
    storeChoice("sidebar-right", open ? "open" : "closed");
  }

  function openTool(tool: ToolId) {
    setActiveTool(tool);
    setOpenedTools((tools) => (tools.includes(tool) ? tools : [...tools, tool]));
    setRightOpen(true);
  }

  /** A tool's own Close button ends it (a test chat is gone) and hides the sidebar. */
  function closeTool(tool: ToolId) {
    setOpenedTools((tools) => tools.filter((t) => t !== tool));
    setRightOpen(false);
  }

  // The user's prompts file (if any) replaces built-in prompt sections from the first AI request on.
  useEffect(() => {
    void usePromptFileStore.getState().reload();
  }, []);

  // Mirrors the toolbar's filename/dirty display into the native window title, so the card in
  // progress is distinguishable from the taskbar or Alt+Tab without focusing the window first.
  useEffect(() => {
    const [path, dirty, fallback] =
      mode === "lorebooks"
        ? [activeLorebook?.currentFilePath, activeLorebook?.isDirty, "New lorebook"]
        : mode === "personas"
          ? [personaPath, personaDirty, "New persona"]
          : mode === "presets"
            ? [activePreset?.path, activePreset?.isDirty, "No preset"]
            : [currentFilePath, isDirty, "New card"];
    const fileName = path ? path.split(/[\\/]/).pop() : fallback;
    getCurrentWindow().setTitle(`${dirty ? "● " : ""}${fileName} — SillyTavern Card Editor`);
  }, [mode, activeLorebook, currentFilePath, isDirty, personaPath, personaDirty, activePreset]);

  // Warn before the window closes with unsaved changes, same confirmation as New/Open.
  // destroy() (rather than close()) bypasses onCloseRequested entirely, so confirming doesn't
  // re-trigger this same handler and re-prompt.
  useEffect(() => {
    const win = getCurrentWindow();
    const describeError = (err: unknown) =>
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);

    const unlisten = win.onCloseRequested(async (event) => {
      const cardsDirty = useCardStore.getState().characters.some((c) => c.isDirty);
      const lorebooksDirty = useLorebookStore.getState().lorebooks.some((l) => l.isDirty);
      const personasDirty = usePersonaStore.getState().characters.some((c) => c.isDirty);
      const presetsDirty = useStPresetStore.getState().presets.some((p) => p.isDirty);
      if (!cardsDirty && !lorebooksDirty && !personasDirty && !presetsDirty) return;
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
      if (modeRef.current === "lorebooks") {
        try {
          const failed = await openLorebookPaths(payload.paths);
          if (failed.length > 0) setError(failed.join(" — "));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (modeRef.current === "presets") {
        try {
          const failed = await openPresetPaths(payload.paths);
          if (failed.length > 0) setError(failed.join(" — "));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      const [path] = payload.paths;
      if (!path) return;
      try {
        await openCardAtPath(path, modeRef.current === "personas" ? usePersonaStore : undefined);
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
      <TextContextMenu onError={setError} />
      {isDragOver && (
        <div className="drop-overlay">
          <p>
            {mode === "lorebooks"
              ? "Drop lorebook files here to open them (.json)"
              : mode === "presets"
                ? "Drop preset files here to open them (.json)"
                : "Drop a file here to open it (.png / .json)"}
          </p>
        </div>
      )}

      <div className="workspace">
        {isLeftOpen ? (
          <Sidebar side="left" storageKey="sidebar-left-width" defaultWidth={220} minWidth={160} maxWidth={420}>
            <LeftSidebar mode={mode} onModeChange={setMode} onError={setError} onHide={() => setLeftOpen(false)} />
          </Sidebar>
        ) : (
          <SidebarRail side="left" title="Show the sidebar" onOpen={() => setLeftOpen(true)} />
        )}

        <div className="workspace-main">
          {mode === "characters" && (
            <HeaderBar
              onError={setError}
              onShowLorebooks={() => setMode("lorebooks")}
              onOpenTool={openTool}
              isLeftOpen={isLeftOpen}
              isRightOpen={isRightOpen && !!card}
              onToggleLeft={() => setLeftOpen(!isLeftOpen)}
              onToggleRight={() => (isRightOpen ? setRightOpen(false) : openTool(activeTool))}
            />
          )}

          {error && (
            <div className="error-banner">
              {error}
              <button type="button" className="secondary" onClick={() => setError(null)}>
                ✕
              </button>
            </div>
          )}

          {mode === "lorebooks" ? (
            <LorebookWorkspace onError={setError} />
          ) : mode === "personas" ? (
            <PersonaWorkspace onError={setError} />
          ) : mode === "presets" ? (
            <PresetWorkspace onError={setError} />
          ) : !card ? (
            <div className="empty-state">
              <p>No card loaded. Create a new card or open an existing one.</p>
              <RecentCardsList onError={setError} />
              <div className="empty-state-groups">
                <RecentGroupsSection onError={setError} />
              </div>
            </div>
          ) : (
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
              <ActiveTab
                card={card}
                onChange={updateCard}
                onError={setError}
                onShowLorebooks={() => setMode("lorebooks")}
              />
            </div>
          )}
        </div>

        {/* Stays mounted while hidden or in another mode, so a running test chat survives. */}
        {card && (
          <Sidebar
            side="right"
            storageKey="sidebar-right-width"
            defaultWidth={420}
            minWidth={300}
            maxWidth={900}
            hidden={!isRightOpen || mode !== "characters"}
          >
            <RightSidebar
              active={activeTool}
              opened={openedTools}
              onSelect={openTool}
              onCloseTool={closeTool}
              onHide={() => setRightOpen(false)}
              onError={setError}
            />
          </Sidebar>
        )}
        {card && mode === "characters" && !isRightOpen && (
          <SidebarRail side="right" title="Show the tools sidebar" onOpen={() => openTool(activeTool)} />
        )}
      </div>
    </div>
  );
}

export default App;
