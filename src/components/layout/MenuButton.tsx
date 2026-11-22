import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Tooltip — also explains why an item is disabled. */
  title?: string;
  shortcut?: string;
}

interface Props {
  label: string;
  items: (MenuItem | "separator")[];
  title?: string;
}

/** A header button that drops down a list of actions. Closes on a pick, a click elsewhere or Escape. */
export function MenuButton({ label, items, title }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className={open ? "secondary menu-button active" : "secondary menu-button"}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item, i) =>
            item === "separator" ? (
              <div key={`sep-${i}`} className="menu-separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
