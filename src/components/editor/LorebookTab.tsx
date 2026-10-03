import { useState } from "react";
import { confirmAction } from "../../io/confirmDiscard";
import { exportLorebook, importLorebook } from "../../io/lorebookIO";
import { linkedWorldName, sharedBookPatch, sharedNameForCard } from "../../schema/sharedLorebook";
import { useLorebookStore } from "../../state/lorebookStore";
import { AiLorebookAssistPanel } from "./AiLorebookAssistPanel";
import { LorebookBody } from "./LorebookBody";
import type { TabProps } from "./types";

export function LorebookTab({ card, onChange, onError, onShowLorebooks }: TabProps) {
  const book = card.character_book;
  const [isAiAssistOpen, setIsAiAssistOpen] = useState(false);
  const linkedName = linkedWorldName(card);

  /** Hands this card's lorebook over to the Lorebooks mode as the shared source of truth: links
   * the card to it by name and opens a copy there — or, if a lorebook of that name is already
   * open, just switches to it (the card is then linked, and "Sync to characters…" updates it). */
  function handleShare() {
    if (!book) return;
    const name = sharedNameForCard(card);
    const named = { ...book, name };
    const store = useLorebookStore.getState();
    const open = store.lorebooks.find((l) => l.book.name === name);
    if (open) store.setActive(open.id);
    else store.addUnsaved(structuredClone(named));
    if (linkedName !== name || book.name !== name) onChange(sharedBookPatch(card, named));
    onShowLorebooks?.();
  }

  async function handleImport() {
    try {
      if (book && book.entries.length > 0) {
        const proceed = await confirmAction(
          "This card already has a lorebook with entries. Importing will replace it completely. Continue?",
          "Replace lorebook?",
        );
        if (!proceed) return;
      }
      const imported = await importLorebook();
      if (imported) onChange({ character_book: imported });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport() {
    if (!book) return;
    try {
      await exportLorebook(book);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!book) {
    return (
      <div className="tab-panel">
        <p>This card doesn't have a lorebook yet.</p>
        <div className="field-row">
          <button
            type="button"
            onClick={() => onChange({ character_book: { entries: [], extensions: {} } })}
          >
            Enable lorebook
          </button>
          <button type="button" className="secondary" onClick={handleImport}>
            Import lorebook…
          </button>
          <button type="button" className="secondary" onClick={() => setIsAiAssistOpen(true)}>
            Suggest entries with AI…
          </button>
        </div>
        {isAiAssistOpen && (
          <AiLorebookAssistPanel
            book={undefined}
            onChange={(merged) => onChange({ character_book: merged })}
            onClose={() => setIsAiAssistOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <LorebookBody
      book={book}
      onChange={(next) => onChange({ character_book: next })}
      notice={
        linkedName && (
          <p className="field-hint lorebook-link-notice">
            Linked to the shared lorebook “{linkedName}”. Edit it in the Lorebooks mode — changes made here are
            overwritten the next time it's synced to this card.
          </p>
        )
      }
      actions={
        <>
          {onShowLorebooks && (
            <button
              type="button"
              className="secondary"
              title="Opens this lorebook in the Lorebooks mode and links this card to it, so several characters can share it"
              onClick={handleShare}
            >
              {linkedName ? "Open shared lorebook" : "Share with other characters…"}
            </button>
          )}
          <button type="button" className="secondary" onClick={handleExport}>
            Export…
          </button>
          <button type="button" className="secondary" onClick={handleImport}>
            Import…
          </button>
          <button
            type="button"
            className="danger secondary"
            onClick={() => onChange({ character_book: undefined })}
          >
            Remove lorebook
          </button>
        </>
      }
    />
  );
}
