import { useEffect, useState } from "react";
import { confirmDiscardChanges } from "../../io/confirmDiscard";
import { openCardFile, saveCard, saveCardAsCopy } from "../../io/fileIO";
import { buildPersonaSystemPrompt, PERSONA_AI_FIELD_KEYS } from "../../schema/aiPrompt";
import { personaMacroWarning } from "../../schema/persona";
import { combineWarnings, emptyNameWarning, unbalancedMacroWarning } from "../../schema/warnings";
import { CardStoreContext } from "../../state/cardStoreContext";
import { usePersonaStore } from "../../state/personaStore";
import { TextAreaField, TextField } from "../common/FormField";
import { AiAssistPanel } from "../editor/AiAssistPanel";
import { AvatarPanel } from "../image/AvatarPanel";

interface Props {
  onError: (message: string) => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The "Personas" mode: personas are slim character cards (name, description, avatar) that
 * SillyTavern turns into a real persona via "Convert to Persona" — see schema/persona.ts. Same
 * shape as the other modes (toolbar → tab strip → editor) and the same card file handling, just
 * against `usePersonaStore` and with only the fields that survive the conversion. */
export function PersonaWorkspace({ onError }: Props) {
  const personas = usePersonaStore((s) => s.characters);
  const activeId = usePersonaStore((s) => s.activeId);
  const persona = usePersonaStore((s) => s.card);
  const isDirty = usePersonaStore((s) => s.isDirty);
  const currentFilePath = usePersonaStore((s) => s.currentFilePath);
  const newCard = usePersonaStore((s) => s.newCard);
  const updateCard = usePersonaStore((s) => s.updateCard);
  const setActive = usePersonaStore((s) => s.setActiveCharacter);
  const close = usePersonaStore((s) => s.closeCharacter);
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      onError(describe(err));
    }
  }

  const handleOpen = () => run(() => openCardFile(usePersonaStore));
  const handleSave = (mode: "save" | "saveAs") => run(() => saveCard(mode, usePersonaStore));

  function handleOpenAiAssist() {
    if (!usePersonaStore.getState().card) newCard();
    setIsAiAssistOpen(true);
  }

  async function handleClose(id: string, dirty: boolean) {
    if (dirty && !(await confirmDiscardChanges())) return;
    close(id);
  }

  // Ctrl+N/O/S act on personas while this mode is shown — the other modes' toolbars, which bind
  // the same keys, aren't mounted then.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        usePersonaStore.getState().newCard();
      } else if (key === "o") {
        e.preventDefault();
        handleOpen();
      } else if (key === "s") {
        e.preventDefault();
        handleSave("save");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "New persona";

  return (
    <CardStoreContext.Provider value={usePersonaStore}>
      <div className="toolbar">
        <button type="button" onClick={newCard} title="Ctrl+N">
          New
        </button>
        <button
          type="button"
          onClick={handleOpen}
          title="Ctrl+O — a regular character card opened here becomes a persona"
        >
          Open…
        </button>
        <button type="button" onClick={() => handleSave("save")} disabled={!persona} title="Ctrl+S">
          Save
        </button>
        <button type="button" className="secondary" onClick={() => handleSave("saveAs")} disabled={!persona}>
          Save As…
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => run(() => saveCardAsCopy(usePersonaStore))}
          disabled={!persona}
        >
          Save as Copy…
        </button>
        <button type="button" className="secondary" onClick={handleOpenAiAssist}>
          AI Assistant…
        </button>
        {persona && (
          <div className="toolbar-title">
            {fileName}
            {isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
          </div>
        )}
      </div>

      {personas.length > 0 && (
        <div className="character-tab-bar">
          {personas.map((p) => (
            <div key={p.id} className={p.id === activeId ? "character-tab active" : "character-tab"}>
              <button type="button" className="character-tab-select" onClick={() => setActive(p.id)}>
                {p.card.name || "New persona"}
                {p.isDirty && <span className="dirty-indicator" title="Unsaved changes"> ●</span>}
              </button>
              <button
                type="button"
                className="character-tab-close"
                title="Close tab"
                onClick={() => run(() => handleClose(p.id, p.isDirty))}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="character-tab-add" title="New persona as a tab" onClick={newCard}>
            +
          </button>
        </div>
      )}

      {isAiAssistOpen && persona && (
        <AiAssistPanel
          card={persona}
          onChange={updateCard}
          onClose={() => setIsAiAssistOpen(false)}
          fieldKeys={PERSONA_AI_FIELD_KEYS}
          buildSystem={buildPersonaSystemPrompt}
          title="AI Assistant — Persona"
          placeholder="e.g. “A retired mercenary turned tavern keeper” or “Make her look older”"
        />
      )}

      {!persona ? (
        <div className="empty-state">
          <p>
            No persona open. Create a new one, or open a persona saved here before — opening a regular character card
            turns it into a persona.
          </p>
        </div>
      ) : (
        <div className="editor-layout">
          <AvatarPanel />
          <div className="editor-main">
            <div className="tab-panel">
              <TextField
                label="Name"
                value={persona.name}
                onChange={(name) => updateCard({ name })}
                warning={emptyNameWarning(persona.name)}
              />
              <TextAreaField
                label="Description"
                value={persona.description}
                onChange={(description) => updateCard({ description })}
                rows={12}
                hint="Who you are in the roleplay — what the characters you talk to can see and know about you"
                showTokenCount
                warning={combineWarnings(
                  unbalancedMacroWarning(persona.description),
                  personaMacroWarning(persona.description),
                )}
              />
              <div className="persona-howto">
                <strong>Getting it into SillyTavern</strong>
                <ol>
                  <li>Save as PNG (with avatar) and import it like a character card.</li>
                  <li>
                    Open that character → <em>More… → Convert to Persona</em>. Name, description and avatar are taken
                    over; converting again later overwrites the persona with your changes.
                  </li>
                  <li>Delete the helper character afterwards.</li>
                  <li>
                    Title, description position and a linked lorebook are set afterwards in SillyTavern's Persona
                    Management — the conversion doesn't carry them over.
                  </li>
                </ol>
                <p className="field-hint">
                  SillyTavern keys the persona by name (“{persona.name || "Name"} (Persona)”), so renaming it creates a
                  new persona there instead of updating the old one.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </CardStoreContext.Provider>
  );
}
