import { appConfigDir, join } from "@tauri-apps/api/path";
import { denormalize, type NormalizedCard } from "../schema/normalize";
import { deleteFile, writeBinary } from "./rawFile";

async function autosavePath(slotId: string): Promise<string> {
  return join(await appConfigDir(), "autosave", `${slotId}.json`);
}

/** Best-effort snapshot of one character tab's current (possibly unsaved) card, written when the
 * tab is left — see cardStore's `setActiveCharacter`. A safety net for juggling several open
 * characters at once, not a real save: failures are swallowed, since losing an autosave snapshot
 * must never block switching tabs or surface as a user-facing error. */
export async function writeAutosave(slotId: string, card: NormalizedCard): Promise<void> {
  try {
    const targetSpec = card.sourceSpec === "v2" ? "v2" : "v3";
    const json = JSON.stringify(denormalize(card, targetSpec), null, 2);
    await writeBinary(await autosavePath(slotId), new TextEncoder().encode(json));
  } catch {
    // best-effort — see above
  }
}

/** Called once a tab is closed for good (saved or its discard explicitly confirmed) — the
 * snapshot's job is done, so it shouldn't linger in the autosave folder indefinitely. */
export async function clearAutosave(slotId: string): Promise<void> {
  try {
    await deleteFile(await autosavePath(slotId));
  } catch {
    // best-effort — see writeAutosave
  }
}
