import { useCardStore } from "../state/cardStore";
import { cardFileForExport } from "./fileIO";
import { saveIntoLibrary } from "./library";
import { safeName } from "../schema/library";

/** Copies open cards into the library (a group folder, or the top level). The open cards keep
 * their own files; the library gets copies. Returns how many were new and how many identical. */
export async function saveCardsToLibrary(slotIds: string[], group: string | null): Promise<{ added: number; same: number; skipped: string[] }> {
  let added = 0;
  let same = 0;
  const skipped: string[] = [];
  for (const id of slotIds) {
    const slot = useCardStore.getState().characters.find((c) => c.id === id);
    if (!slot) continue;
    if (!slot.card.name.trim()) {
      skipped.push("a card without a name");
      continue;
    }
    const { bytes, format } = cardFileForExport(slot.card, slot.avatarPng);
    const saved = await saveIntoLibrary(bytes, `${safeName(slot.card.name)}.${format}`, group);
    if (saved.duplicate) same++;
    else added++;
  }
  return { added, same, skipped };
}
