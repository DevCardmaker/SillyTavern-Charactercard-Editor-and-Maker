import { useRef, useState, type ReactNode } from "react";

interface Props {
  side: "left" | "right";
  /** localStorage key for the width the user dragged it to. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Hidden but still mounted, so what's inside keeps its state. */
  hidden?: boolean;
  children: ReactNode;
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
  } catch {
    // Storage unavailable: the default width is fine.
  }
  return fallback;
}

/** A side column whose inner edge can be dragged; the width is remembered between starts. */
export function Sidebar({ side, storageKey, defaultWidth, minWidth, maxWidth, hidden, children }: Props) {
  const [width, setWidth] = useState(() => readWidth(storageKey, defaultWidth, minWidth, maxWidth));
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  // Pointer capture keeps the drag going when the pointer leaves the thin handle. The handle sits
  // on the edge facing the middle, so dragging towards the middle makes the column wider.
  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width };
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const moved = e.clientX - drag.current.startX;
    const next = drag.current.startWidth + (side === "left" ? moved : -moved);
    setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
  }

  function onResizeEnd() {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // Only a convenience.
    }
  }

  return (
    <aside className={`sidebar sidebar-${side}`} style={{ width }} hidden={hidden}>
      <div
        className="sidebar-resizer"
        title="Drag to resize"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
      />
      {children}
    </aside>
  );
}

/** What's left of a hidden sidebar: a thin strip with a button to bring it back. */
export function SidebarRail({ side, title, onOpen }: { side: "left" | "right"; title: string; onOpen: () => void }) {
  return (
    <div className={`sidebar-rail sidebar-rail-${side}`}>
      <button type="button" className="sidebar-rail-button" title={title} onClick={onOpen}>
        {side === "left" ? "›" : "‹"}
      </button>
    </div>
  );
}
