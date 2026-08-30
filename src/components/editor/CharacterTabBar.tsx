import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { confirmDiscardChanges } from "../../io/confirmDiscard";
import { saveGroupToFolder } from "../../io/fileIO";
import { useCardStore } from "../../state/cardStore";
import { AiConsistencyCheckPanel } from "./AiConsistencyCheckPanel";

interface Props {
  onError: (message: string) => void;
}

/** Outer tab strip, one chip per simultaneously open character — sits above the existing
 * Basis/Prompts/Greetings/…-tab bar for whichever character is currently active. Reads directly
 * from the store (characters/activeId/groupFolder), same pattern as AvatarPanel, since none of
 * this is part of the "active card" mirror every other tab component consumes via props. */
export function CharacterTabBar({ onError }: Props) {
  const characters = useCardStore((s) => s.characters);
  const activeId = useCardStore((s) => s.activeId);
  const groupFolder = useCardStore((s) => s.groupFolder);
  const setActiveCharacter = useCardStore((s) => s.setActiveCharacter);
  const closeCharacter = useCardStore((s) => s.closeCharacter);
  const setGroupFolder = useCardStore((s) => s.setGroupFolder);
  const newCard = useCardStore((s) => s.newCard);
  const [isConsistencyCheckOpen, setIsConsistencyCheckOpen] = useState(false);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  if (characters.length === 0) return null;

  async function handleClose(id: string, isDirty: boolean) {
    if (isDirty && !(await confirmDiscardChanges())) return;
    closeCharacter(id);
  }

  async function handleChooseGroupFolder() {
    const dir = await open({ directory: true });
    if (!dir || Array.isArray(dir)) return;
    setGroupFolder(dir);
  }

  /** Reuses the already-chosen `groupFolder` if there is one; otherwise asks for a folder first
   * (same dialog as "Choose Group Folder…") so this works as a single-click action even when
   * nothing was set up beforehand. */
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

  return (
    <div className="character-tab-bar">
      {characters.map((c) => (
        <div key={c.id} className={c.id === activeId ? "character-tab active" : "character-tab"}>
          <button type="button" className="character-tab-select" onClick={() => setActiveCharacter(c.id)}>
            {c.card.name || "New card"}
            {c.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </button>
          <button
            type="button"
            className="character-tab-close"
            title="Close tab"
            onClick={() => {
              handleClose(c.id, c.isDirty).catch((err) => onError(err instanceof Error ? err.message : String(err)));
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="character-tab-add" title="Add a new card as a tab" onClick={() => newCard()}>
        +
      </button>
      {characters.length >= 2 && (
        <button
          type="button"
          className="character-tab-group-folder"
          title={groupFolder ? `Shared save folder: ${groupFolder}` : "Choose a shared folder for new cards in this group"}
          onClick={() => {
            handleChooseGroupFolder().catch((err) => onError(err instanceof Error ? err.message : String(err)));
          }}
        >
          Choose Group Folder…
        </button>
      )}
      {characters.length >= 2 && (
        <button
          type="button"
          className="character-tab-group-folder"
          disabled={isSavingGroup}
          title="Save every open tab into a folder without individual dialogs"
          onClick={() => {
            handleSaveGroup().catch((err) => onError(err instanceof Error ? err.message : String(err)));
          }}
        >
          {isSavingGroup ? "Saving…" : "Save Group…"}
        </button>
      )}
      {characters.length >= 2 && (
        <button type="button" className="character-tab-group-folder" onClick={() => setIsConsistencyCheckOpen(true)}>
          Consistency Check…
        </button>
      )}

      {isConsistencyCheckOpen && <AiConsistencyCheckPanel onClose={() => setIsConsistencyCheckOpen(false)} />}
    </div>
  );
}
