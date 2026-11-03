import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  x: number;
  y: number;
  /** The field that was right-clicked, if any; otherwise the menu is about selected page text. */
  field: TextField | null;
  selectedText: string;
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image"]);

function textFieldAt(target: EventTarget | null): TextField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest("input, textarea");
  if (field instanceof HTMLTextAreaElement) return field;
  return field instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(field.type) ? field : null;
}

function selectionIn(field: TextField): string {
  const { selectionStart: start, selectionEnd: end, value } = field;
  return start === null || end === null ? "" : value.slice(start, end);
}

/** Types into a field the way the keyboard does, so React sees the change and Ctrl+Z still works.
 * The fallback for a webview without that command sets the value and reports the change itself. */
function insertIntoField(field: TextField, text: string): void {
  field.focus();
  if (document.execCommand("insertText", false, text)) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
    field,
    `${field.value.slice(0, start)}${text}${field.value.slice(end)}`,
  );
  field.setSelectionRange?.(start + text.length, start + text.length);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The app's own right-click menu for text: the webview's built-in one isn't reliably there on
 * every system, and looks and behaves differently on each. Elsewhere right-clicking does nothing,
 * which also keeps webview entries like "Reload" out of the app. */
export function TextContextMenu({ onError }: { onError: (message: string) => void }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      const field = textFieldAt(e.target);
      const selectedText = field && !field.disabled ? selectionIn(field) : (window.getSelection()?.toString() ?? "");
      setMenu(field || selectedText ? { x: e.clientX, y: e.clientY, field, selectedText } : null);
    }
    function close() {
      setMenu(null);
    }
    function onMouseDown(e: MouseEvent) {
      if (!element.current?.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  // Keeps the menu inside the window; only its real size says how far it has to move.
  useEffect(() => {
    const el = element.current;
    if (!el || !menu) return;
    el.style.left = `${Math.max(0, Math.min(menu.x, window.innerWidth - el.offsetWidth))}px`;
    el.style.top = `${Math.max(0, Math.min(menu.y, window.innerHeight - el.offsetHeight))}px`;
  }, [menu]);

  if (!menu) return null;
  const { field, selectedText } = menu;
  const writable = !!field && !field.disabled && !field.readOnly;

  async function run(action: () => Promise<void> | void) {
    setMenu(null);
    try {
      await action();
    } catch (err) {
      onError(`Clipboard: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const items: { label: string; enabled: boolean; action: () => Promise<void> | void }[] = [
    {
      label: "Cut",
      enabled: writable && !!selectedText,
      action: async () => {
        await writeText(selectedText);
        if (field) insertIntoField(field, "");
      },
    },
    { label: "Copy", enabled: !!selectedText, action: () => writeText(selectedText) },
    {
      label: "Paste",
      enabled: writable,
      action: async () => {
        const text = await readText();
        if (field && text) insertIntoField(field, text);
      },
    },
    {
      label: "Select all",
      enabled: !!field && !field.disabled && field.value.length > 0,
      action: () => field?.select(),
    },
  ];

  return (
    <div ref={element} className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={!item.enabled}
          // Keeps the focus and the selection in the text field while the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void run(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
