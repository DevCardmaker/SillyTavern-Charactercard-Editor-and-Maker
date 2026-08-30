import { confirm } from "@tauri-apps/plugin-dialog";

/** Native confirm dialog. Deliberately not `window.confirm()`: that's WebKitGTK's DOM dialog,
 * which can hang indefinitely when triggered from a non-click context (like a Tauri close-request
 * IPC event) instead of showing anything, effectively freezing the window shut. */
export async function confirmAction(message: string, title: string): Promise<boolean> {
  return confirm(message, { title, kind: "warning" });
}

/** Used before closing a dirty tab and before the window closes with unsaved changes. */
export async function confirmDiscardChanges(): Promise<boolean> {
  return confirmAction("There are unsaved changes. Continue and discard them anyway?", "Unsaved changes");
}
