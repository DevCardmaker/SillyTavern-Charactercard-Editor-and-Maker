import { open } from "@tauri-apps/plugin-dialog";
import { readBinary } from "./rawFile";

const STORY_FILTERS = [{ name: "Story text", extensions: ["txt", "md"] }];

/** Picks a .txt/.md file and returns its text, or null if the dialog was cancelled. Read as UTF-8
 * (a byte-order mark is dropped). */
export async function pickStoryFile(): Promise<{ fileName: string; text: string } | null> {
  const selected = await open({ multiple: false, filters: STORY_FILTERS });
  if (!selected || Array.isArray(selected)) return null;
  const text = new TextDecoder("utf-8").decode(await readBinary(selected)).replace(/^﻿/, "");
  return { fileName: selected.split(/[\\/]/).pop() ?? selected, text };
}
