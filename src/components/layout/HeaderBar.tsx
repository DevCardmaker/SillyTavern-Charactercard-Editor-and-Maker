import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { useTotalTokenCount } from "../../hooks/useTokenCount";
import { openCardFile, openFolderAsTabs, saveCard, saveCardAsCopy, saveGroupToFolder } from "../../io/fileIO";
import { useCardStore } from "../../state/cardStore";
import { useLibrarySaveStore } from "../../state/librarySaveStore";
import { useStDialogStore } from "../../state/stDialogStore";
import { AiConsistencyCheckPanel } from "../editor/AiConsistencyCheckPanel";
import { AiGroupGeneratePanel } from "../editor/AiGroupGeneratePanel";
import { AiGroupScenePanel } from "../editor/AiGroupScenePanel";
import { AiRelocatePanel } from "../editor/AiRelocatePanel";
import { AiSplitGroupPanel } from "../editor/AiSplitGroupPanel";
import { GroupLorebookPanel } from "../editor/GroupLorebookPanel";
import { ImageToCardsPanel } from "../editor/ImageToCardsPanel";
import { MergeCardsPanel } from "../editor/MergeCardsPanel";
import { StoryToCardsPanel } from "../editor/StoryToCardsPanel";
import { TranslateCardPanel } from "../editor/TranslateCardPanel";
import { ModelSwitcher, SettingsMenu } from "./GlobalTools";
import { MenuButton } from "./MenuButton";
import type { ToolId } from "./RightSidebar";

interface Props {
  onError: (message: string) => void;
  onShowLorebooks: () => void;
  /** Opens the right sidebar on the given tool. */
  onOpenTool: (tool: ToolId) => void;
  isLeftOpen: boolean;
  isRightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

type DialogId =
  | "groupGenerate"
  | "story"
  | "image"
  | "groupScene"
  | "consistency"
  | "relocate"
  | "groupLorebook"
  | "merge"
  | "split"
  | "translate";

/** The characters mode's top bar: which card is open, Save, and the menus that replace the old row
 * of buttons. Dialogs that create new cards open from here; tools for the open card live in the
 * right sidebar. */
export function HeaderBar({ onError, onShowLorebooks, onOpenTool, isLeftOpen, isRightOpen, onToggleLeft, onToggleRight }: Props) {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const isDirty = useCardStore((s) => s.isDirty);
  const currentFilePath = useCardStore((s) => s.currentFilePath);
  const groupFolder = useCardStore((s) => s.groupFolder);
  const setGroupFolder = useCardStore((s) => s.setGroupFolder);
  const newCard = useCardStore((s) => s.newCard);
  const openCount = useCardStore((s) => s.characters.length);
  const totalTokenCount = useTotalTokenCount(card);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const activeId = useCardStore((s) => s.activeId);
  const openStSend = useStDialogStore((s) => s.openSend);
  const openStGroup = useStDialogStore((s) => s.openCreateGroup);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const avatarUrl = useMemo(
    () => (avatarPng ? URL.createObjectURL(new Blob([avatarPng], { type: "image/png" })) : null),
    [avatarPng],
  );
  useEffect(() => () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl); }, [avatarUrl]);

  function report(err: unknown) {
    onError(err instanceof Error ? err.message : String(err));
  }

  async function handleOpenFolder() {
    const { opened, failed } = await openFolderAsTabs();
    if (failed.length > 0) {
      onError(
        `${opened} card(s) loaded from the folder, ${failed.length} skipped (not a valid character card): ` +
          failed.join(", "),
      );
    }
  }

  async function handleChooseGroupFolder() {
    const dir = await open({ directory: true });
    if (!dir || Array.isArray(dir)) return;
    setGroupFolder(dir);
  }

  /** Reuses the chosen group folder, or asks for one first, so this works as a single click. */
  async function handleSaveGroup() {
    let folder = groupFolder;
    if (!folder) {
      const dir = await open({ directory: true });
      if (!dir || Array.isArray(dir)) return;
      folder = dir;
      setGroupFolder(dir);
    }
    setIsSavingGroup(true);
    try {
      const { skippedEmpty, failed } = await saveGroupToFolder(folder);
      const notes: string[] = [];
      if (skippedEmpty > 0) notes.push(`${skippedEmpty} empty card(s) skipped`);
      if (failed.length > 0) notes.push(`${failed.length} card(s) could not be saved: ${failed.join(", ")}`);
      if (notes.length > 0) onError(notes.join(" — "));
    } finally {
      setIsSavingGroup(false);
    }
  }

  function handleAiAssistNewCard() {
    newCard();
    onOpenTool("assist");
  }

  // Ctrl+N/O/S. Everything goes through the store/fileIO directly, so the listener never goes stale.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        useCardStore.getState().newCard();
      } else if (key === "o") {
        e.preventDefault();
        openCardFile().catch(report);
      } else if (key === "s") {
        e.preventDefault();
        saveCard("save").catch(report);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsTwo = openCount < 2 ? "Needs at least two open characters" : undefined;
  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : null;

  return (
    <header className="header-bar">
      <button
        type="button"
        className={isLeftOpen ? "secondary sidebar-toggle active" : "secondary sidebar-toggle"}
        title={isLeftOpen ? "Hide the left sidebar" : "Show the left sidebar"}
        onClick={onToggleLeft}
      >
        ◧
      </button>

      <div className="header-card">
        {avatarUrl ? <img className="header-avatar" src={avatarUrl} alt="" /> : <div className="header-avatar header-avatar-empty" />}
        <div className="header-card-text">
          <strong className="header-card-name">
            {card ? card.name || "New card" : "No card open"}
            {isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </strong>
          <span className="header-card-meta" title={currentFilePath ?? undefined}>
            {card ? (fileName ?? "not saved yet") : ""}
            {card && totalTokenCount !== null && (
              <button
                type="button"
                className="link-button header-tokens"
                title="Sum of description, personality, scenario, first message, example dialogue — click for the full context budget"
                onClick={() => onOpenTool("budget")}
              >
                · {totalTokenCount} tokens
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="header-actions">
        <ModelSwitcher />
        <button type="button" onClick={() => saveCard("save").catch(report)} disabled={!card} title="Ctrl+S">
          Save
        </button>
        <MenuButton
          label="File"
          items={[
            { label: "New", shortcut: "Ctrl+N", onSelect: () => newCard() },
            { label: "Open…", shortcut: "Ctrl+O", onSelect: () => openCardFile().catch(report) },
            {
              label: "Open Folder…",
              title: "Open every .png/.json card from a folder, each as its own card",
              onSelect: () => handleOpenFolder().catch(report),
            },
            "separator",
            { label: "Save As…", disabled: !card, onSelect: () => saveCard("saveAs").catch(report) },
            {
              label: "Save as Copy…",
              disabled: !card,
              title: "Additionally export the current state elsewhere, without switching the currently open file",
              onSelect: () => saveCardAsCopy().catch(report),
            },
            "separator",
            {
              label: "Save to Library…",
              disabled: !card,
              title: "Put a copy of this card into the card library",
              onSelect: () => useLibrarySaveStore.getState().open("card"),
            },
            {
              label: "Send to SillyTavern…",
              disabled: !card,
              title: "Send this card to SillyTavern — over the one it came from, or as a new character",
              onSelect: () => activeId && openStSend("card", activeId),
            },
            "separator",
            {
              label: "Choose Group Folder…",
              title: groupFolder ? `Shared save folder: ${groupFolder}` : "Choose a shared folder for new cards in this group",
              onSelect: () => handleChooseGroupFolder().catch(report),
            },
            {
              label: isSavingGroup ? "Saving…" : "Save Group…",
              disabled: openCount < 2 || isSavingGroup,
              title: needsTwo ?? "Save every open card into a folder without individual dialogs",
              onSelect: () => handleSaveGroup().catch(report),
            },
          ]}
        />
        <MenuButton
          label="Create"
          title="Create new cards with the AI"
          items={[
            { label: "New card with AI Assistant…", onSelect: handleAiAssistNewCard },
            { label: "Create Group…", onSelect: () => setDialog("groupGenerate") },
            {
              label: "From Story…",
              title: "Create character cards from a story — fan fiction, a short story, an excerpt from a book",
              onSelect: () => setDialog("story"),
            },
            {
              label: "From Image…",
              title: "Create character cards from a picture that tells a story — needs a model that can see images",
              onSelect: () => setDialog("image"),
            },
          ]}
        />
        <MenuButton
          label="Group"
          title="Work on all open characters together"
          items={[
            {
              label: "Group Greeting…",
              disabled: openCount < 2,
              title: needsTwo ?? "Write one opening scene for a group chat with the open characters",
              onSelect: () => setDialog("groupScene"),
            },
            { label: "Consistency Check…", disabled: openCount < 2, title: needsTwo, onSelect: () => setDialog("consistency") },
            { label: "Edit Group…", disabled: openCount < 2, title: needsTwo, onSelect: () => setDialog("relocate") },
            {
              label: "Group Lorebook…",
              disabled: openCount < 2,
              title: needsTwo ?? "Give every open character lorebook entries describing the other members (and open personas)",
              onSelect: () => setDialog("groupLorebook"),
            },
            {
              label: "Save Group to Library…",
              disabled: openCount < 2,
              title: needsTwo ?? "Put copies of all open cards into the library as one group",
              onSelect: () => useLibrarySaveStore.getState().open("group"),
            },
            {
              label: "Create Group in SillyTavern…",
              disabled: openCount < 2,
              title: needsTwo ?? "Send the open cards to SillyTavern and make them a group there, in an order you choose",
              onSelect: openStGroup,
            },
            {
              label: "Merge into One Card…",
              disabled: openCount < 2,
              title: needsTwo ?? "Combine several open characters into one group card that portrays all of them",
              onSelect: () => setDialog("merge"),
            },
          ]}
        />
        <MenuButton
          label="Card"
          title="Turn the open card into new cards"
          items={[
            {
              label: "Split Card…",
              disabled: !card,
              title: "Turn a card that describes several characters into one card per character",
              onSelect: () => setDialog("split"),
            },
            {
              label: "Translate…",
              disabled: !card,
              title: "Translate this card into another language — as a copy in a new card",
              onSelect: () => setDialog("translate"),
            },
          ]}
        />
        <SettingsMenu />
      </div>

      <button
        type="button"
        className={isRightOpen ? "secondary sidebar-toggle active" : "secondary sidebar-toggle"}
        title={isRightOpen ? "Hide the tools sidebar" : "Show the tools sidebar"}
        onClick={onToggleRight}
        disabled={!card}
      >
        ◨
      </button>

      {dialog === "groupGenerate" && (
        <AiGroupGeneratePanel onClose={() => setDialog(null)} onAddedWithReferences={() => setDialog("consistency")} />
      )}
      {dialog === "story" && <StoryToCardsPanel onClose={() => setDialog(null)} onShowLorebooks={onShowLorebooks} />}
      {dialog === "image" && <ImageToCardsPanel onClose={() => setDialog(null)} />}
      {dialog === "groupScene" && <AiGroupScenePanel onClose={() => setDialog(null)} />}
      {dialog === "consistency" && <AiConsistencyCheckPanel onClose={() => setDialog(null)} />}
      {dialog === "relocate" && <AiRelocatePanel onClose={() => setDialog(null)} />}
      {dialog === "groupLorebook" && <GroupLorebookPanel onClose={() => setDialog(null)} />}
      {dialog === "merge" && <MergeCardsPanel onClose={() => setDialog(null)} />}
      {dialog === "split" && <AiSplitGroupPanel onClose={() => setDialog(null)} />}
      {dialog === "translate" && <TranslateCardPanel onClose={() => setDialog(null)} />}
    </header>
  );
}
