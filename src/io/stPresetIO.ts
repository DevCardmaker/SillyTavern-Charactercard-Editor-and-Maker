import { open, save } from "@tauri-apps/plugin-dialog";
import { parseStPreset, serializeStPreset } from "../schema/stPreset";
import { useStPresetStore } from "../state/stPresetStore";
import { confirmAction } from "./confirmDiscard";
import { backupExistingFile } from "./fileIO";
import { readBinary, writeBinary } from "./rawFile";

const PRESET_FILTERS = [{ name: "SillyTavern Chat Completion preset", extensions: ["json"] }];

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await readBinary(path));
}

/** Opens each file as its own tab. Returns one message per file that couldn't be loaded, so the
 * caller can report them without aborting the rest. */
export async function openPresetPaths(paths: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const path of paths) {
    try {
      const text = await readText(path);
      useStPresetStore.getState().loadPreset(parseStPreset(text), path, text);
    } catch (err) {
      failed.push(`${fileNameOf(path)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failed;
}

export async function openPresetFiles(): Promise<string[]> {
  const selected = await open({ multiple: true, filters: PRESET_FILTERS });
  if (!selected) return [];
  return openPresetPaths(Array.isArray(selected) ? selected : [selected]);
}

/** "Save" for the active tab, with the same `backups/` safety copy as card saves. SillyTavern may
 * have rewritten the file while it was open here, so that is asked about instead of overwritten. */
export async function saveActivePreset(mode: "save" | "saveAs"): Promise<void> {
  const state = useStPresetStore.getState();
  const slot = state.presets.find((p) => p.id === state.activeId);
  if (!slot) return;

  let path = slot.path;
  if (mode === "saveAs") {
    const chosen = await save({ filters: PRESET_FILTERS, defaultPath: slot.path });
    if (!chosen) return;
    path = chosen;
  } else {
    let onDisk: string | null;
    try {
      onDisk = await readText(path);
    } catch {
      onDisk = null; // moved or deleted: saving just writes it anew
    }
    if (onDisk !== null && onDisk !== slot.diskText) {
      const overwrite = await confirmAction(
        `"${fileNameOf(path)}" was changed by another program since it was opened here, possibly SillyTavern. Overwrite those changes? A copy of the current file goes to the backups folder.`,
        "File changed",
      );
      if (!overwrite) return;
    }
  }

  const text = serializeStPreset(slot.preset);
  await backupExistingFile(path);
  await writeBinary(path, new TextEncoder().encode(text));
  useStPresetStore.getState().markSaved(slot.id, path, text);
}
