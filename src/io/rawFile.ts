import { invoke } from "@tauri-apps/api/core";

/** Thin wrappers around the two generic Tauri commands used for all filesystem access in this
 * app — both card files (fileIO.ts) and app-level config like prompt presets. Shared here so
 * neither module has to duplicate the invoke plumbing. */

export async function readBinary(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("read_binary_file", { path });
  return Uint8Array.from(bytes);
}

/** write_binary_file creates the target's parent directory on demand, so this also works for a
 * path whose containing folder doesn't exist yet (e.g. the app config dir on first run). */
export async function writeBinary(path: string, data: Uint8Array): Promise<void> {
  await invoke("write_binary_file", { path, data: Array.from(data) });
}

/** delete_file treats an already-missing path as success. */
export async function deleteFile(path: string): Promise<void> {
  await invoke("delete_file", { path });
}

/** Plain filenames (not full paths) of every regular file directly inside `dirPath`. */
export async function listDirFiles(dirPath: string): Promise<string[]> {
  return invoke<string[]>("list_dir_files", { path: dirPath });
}
