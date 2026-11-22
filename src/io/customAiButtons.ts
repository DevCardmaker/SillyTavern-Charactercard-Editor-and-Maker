import { appConfigDir, join } from "@tauri-apps/api/path";
import { readBinary, writeBinary } from "./rawFile";

/** A quick action the user defined: a label for the button and the instruction it sends. */
export interface CustomAiButton {
  id: string;
  label: string;
  instruction: string;
}

const FILENAME = "ai-buttons.json";

async function filePath(): Promise<string> {
  return join(await appConfigDir(), FILENAME);
}

/** Missing or broken file means no buttons yet. */
export async function loadCustomAiButtons(): Promise<CustomAiButton[]> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await readBinary(await filePath())));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b): b is CustomAiButton => typeof b?.label === "string" && typeof b?.instruction === "string")
      .map((b, i) => ({ id: typeof b.id === "string" && b.id ? b.id : `button-${i}`, label: b.label, instruction: b.instruction }));
  } catch {
    return [];
  }
}

/** Buttons without a label or instruction are left out. */
export async function saveCustomAiButtons(buttons: CustomAiButton[]): Promise<CustomAiButton[]> {
  const kept = buttons
    .map((b) => ({ ...b, label: b.label.trim(), instruction: b.instruction.trim() }))
    .filter((b) => b.label && b.instruction);
  await writeBinary(await filePath(), new TextEncoder().encode(JSON.stringify(kept, null, 2)));
  return kept;
}
