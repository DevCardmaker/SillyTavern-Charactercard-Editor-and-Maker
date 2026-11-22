import { useEffect, useState } from "react";
import { openCardFile, saveCard, saveCardAsCopy } from "../../io/fileIO";
import { buildPersonaFitContext, buildPersonaSystemPrompt, PERSONA_AI_FIELD_KEYS } from "../../schema/aiPrompt";
import { overusedNameWarning } from "../../schema/overusedNames";
import { personaMacroWarning } from "../../schema/persona";
import { combineWarnings, emptyNameWarning, unbalancedMacroWarning } from "../../schema/warnings";
import { useCardStore } from "../../state/cardStore";
import { CardStoreContext } from "../../state/cardStoreContext";
import { usePersonaStore } from "../../state/personaStore";
import { useStDialogStore } from "../../state/stDialogStore";
import { TextAreaField, TextField } from "../common/FormField";
import { AiAssistPanel } from "../editor/AiAssistPanel";
import { CardHistoryPanel } from "../editor/CardHistoryPanel";
import { AvatarPanel } from "../image/AvatarPanel";
import { MenuButton } from "../layout/MenuButton";
import { ModeHeader } from "../layout/ModeHeader";

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
  const persona = usePersonaStore((s) => s.card);
  const isDirty = usePersonaStore((s) => s.isDirty);
  const currentFilePath = usePersonaStore((s) => s.currentFilePath);
  const avatarPng = usePersonaStore((s) => s.avatarPng);
  const newCard = usePersonaStore((s) => s.newCard);
  const updateCard = usePersonaStore((s) => s.updateCard);
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const openCharacters = useCardStore((s) => s.characters);

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

  const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "not saved yet";

  return (
    <CardStoreContext.Provider value={usePersonaStore}>
      <ModeHeader
        title={persona ? persona.name || "New persona" : "No persona open"}
        meta={persona ? fileName : undefined}
        dirty={isDirty}
        thumbPng={persona ? avatarPng : undefined}
      >
        <button type="button" onClick={() => handleSave("save")} disabled={!persona} title="Ctrl+S">
          Save
        </button>
        <MenuButton
          label="File"
          items={[
            { label: "New", shortcut: "Ctrl+N", onSelect: newCard },
            { label: "Open…", shortcut: "Ctrl+O", title: "A regular character card opened here becomes a persona", onSelect: handleOpen },
            "separator",
            { label: "Save As…", disabled: !persona, onSelect: () => handleSave("saveAs") },
            {
              label: "Save as Copy…",
              disabled: !persona,
              onSelect: () => run(() => saveCardAsCopy(usePersonaStore)),
            },
            "separator",
            {
              label: "Send to SillyTavern…",
              disabled: !persona,
              title: "Send this persona to SillyTavern — over the one it came from, or as a new persona",
              onSelect: () => {
                const id = usePersonaStore.getState().activeId;
                if (id) useStDialogStore.getState().openSend("persona", id);
              },
            },
          ]}
        />
        <MenuButton
          label="Persona"
          items={[
            {
              label: "History…",
              disabled: !persona,
              title: "Compare with older versions of this persona and bring back all or parts of them",
              onSelect: () => setIsHistoryOpen(true),
            },
            { label: "AI Assistant…", onSelect: handleOpenAiAssist },
          ]}
        />
      </ModeHeader>
      {isHistoryOpen && <CardHistoryPanel store={usePersonaStore} onClose={() => setIsHistoryOpen(false)} />}

      {isAiAssistOpen && persona && (
        <AiAssistPanel
          card={persona}
          onChange={updateCard}
          onClose={() => setIsAiAssistOpen(false)}
          fieldKeys={PERSONA_AI_FIELD_KEYS}
          buildSystem={buildPersonaSystemPrompt}
          title="AI Assistant — Persona"
          placeholder="e.g. “A retired mercenary turned tavern keeper” or “Make her look older”"
          contextLabel="Fit to characters (open in the Characters mode) — tick several for a group chat"
          contextChoices={openCharacters
            .filter((c) => c.card.name.trim())
            .map((c) => ({ label: c.card.name, card: c.card }))}
          buildContext={buildPersonaFitContext}
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
                warning={combineWarnings(emptyNameWarning(persona.name), overusedNameWarning(persona.name))}
              />
              <TextAreaField
                label="Description"
                value={persona.description}
                onChange={(description) => updateCard({ description })}
                rows={12}
                ai={{
                  label: "Persona description",
                  context: () =>
                    `This is the user's own persona for roleplay — who they are in the story, what the characters can see and know about them. Their name: ${persona.name || "(not set)"}. In the text the persona is {{user}}.`,
                  charName: () => "",
                }}
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
