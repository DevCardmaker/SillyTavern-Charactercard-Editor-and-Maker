import { useEffect, useRef, useState } from "react";

const DISPLAY_MAX = 560;
const MIN_SELECTION = 24;
const MAX_EXPORT_SIZE = 1024;

const ASPECT_PRESETS: { label: string; ratio: number | null }[] = [
  { label: "Free", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "2:3", ratio: 2 / 3 },
];

type Corner = "nw" | "ne" | "sw" | "se";
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface DragState {
  mode: "move" | "resize";
  corner?: Corner;
  startPointerX: number;
  startPointerY: number;
  startSelection: Rect;
}

interface Props {
  sourceBytes: Uint8Array;
  onCancel: () => void;
  onConfirm: (png: Uint8Array) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Largest rectangle of the given aspect ratio (or the full frame, if free) that fits centered
 * within the display area. */
function centeredSelection(ratio: number | null, displayWidth: number, displayHeight: number): Rect {
  if (ratio === null) {
    return { x: displayWidth * 0.1, y: displayHeight * 0.1, width: displayWidth * 0.8, height: displayHeight * 0.8 };
  }
  let width = displayWidth;
  let height = width / ratio;
  if (height > displayHeight) {
    height = displayHeight;
    width = height * ratio;
  }
  return { x: (displayWidth - width) / 2, y: (displayHeight - height) / 2, width, height };
}

/** Full-image crop editor: the whole image is always visible at a fixed display size, and the
 * user drags a selection rectangle (with corner handles, optionally aspect-locked) over it —
 * the classic "mask over the image" pattern, rather than zooming/panning the image itself. */
export function CropDialog({ sourceBytes, onCancel, onConfirm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [selection, setSelection] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [aspect, setAspect] = useState<number | null>(1);
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    const blob = new Blob([sourceBytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(DISPLAY_MAX / img.naturalWidth, DISPLAY_MAX / img.naturalHeight);
      const width = img.naturalWidth * s;
      const height = img.naturalHeight * s;
      setImage(img);
      setScale(s);
      setDisplaySize({ width, height });
      setSelection(centeredSelection(aspect, width, height));
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBytes]);

  function changeAspect(ratio: number | null) {
    setAspect(ratio);
    if (displaySize.width > 0) {
      setSelection(centeredSelection(ratio, displaySize.width, displaySize.height));
    }
  }

  function startMove(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: "move",
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startSelection: selection,
    };
  }

  function startResize(e: React.PointerEvent, corner: Corner) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: "resize",
      corner,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startSelection: selection,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const dx = e.clientX - drag.startPointerX;
    const dy = e.clientY - drag.startPointerY;

    if (drag.mode === "move") {
      const { startSelection: s } = drag;
      setSelection({
        ...s,
        x: clamp(s.x + dx, 0, displaySize.width - s.width),
        y: clamp(s.y + dy, 0, displaySize.height - s.height),
      });
      return;
    }

    // Resize: the opposite corner stays fixed as an anchor; the dragged corner follows the pointer.
    const s = drag.startSelection;
    const anchor = {
      x: drag.corner === "nw" || drag.corner === "sw" ? s.x + s.width : s.x,
      y: drag.corner === "nw" || drag.corner === "ne" ? s.y + s.height : s.y,
    };
    const pointer = {
      x: clamp(s.x + (drag.corner === "nw" || drag.corner === "sw" ? 0 : s.width) + dx, 0, displaySize.width),
      y: clamp(s.y + (drag.corner === "nw" || drag.corner === "ne" ? 0 : s.height) + dy, 0, displaySize.height),
    };

    let width = Math.abs(pointer.x - anchor.x);
    let height = Math.abs(pointer.y - anchor.y);
    if (aspect !== null) {
      if (width / aspect >= height) {
        width = Math.max(width, MIN_SELECTION);
        height = width / aspect;
      } else {
        height = Math.max(height, MIN_SELECTION);
        width = height * aspect;
      }
    } else {
      width = Math.max(width, MIN_SELECTION);
      height = Math.max(height, MIN_SELECTION);
    }

    let x = pointer.x >= anchor.x ? anchor.x : anchor.x - width;
    let y = pointer.y >= anchor.y ? anchor.y : anchor.y - height;

    // Clamp the whole rect back inside the frame without changing its size.
    x = clamp(x, 0, displaySize.width - width);
    y = clamp(y, 0, displaySize.height - height);

    setSelection({ x, y, width, height });
  }

  function endInteraction() {
    dragState.current = null;
  }

  function confirm() {
    if (!image) return;
    const sx = selection.x / scale;
    const sy = selection.y / scale;
    const sw = selection.width / scale;
    const sh = selection.height / scale;

    const outScale = Math.min(1, MAX_EXPORT_SIZE / Math.max(sw, sh));
    const outW = Math.round(sw * outScale);
    const outH = Math.round(sh * outScale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      onConfirm(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  }

  const corners: Corner[] = ["nw", "ne", "sw", "se"];
  const cornerCursor: Record<Corner, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Crop Avatar</h3>

        <div className="aspect-picker">
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={preset.ratio === aspect ? "secondary active" : "secondary"}
              onClick={() => changeAspect(preset.ratio)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div
          ref={containerRef}
          className="crop-container"
          style={{ width: displaySize.width, height: displaySize.height }}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
        >
          {image && <img src={image.src} className="crop-image" alt="" draggable={false} />}
          <div
            className="crop-selection"
            style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
            onPointerDown={startMove}
          >
            {corners.map((corner) => (
              <div
                key={corner}
                className={`crop-handle crop-handle-${corner}`}
                style={{ cursor: cornerCursor[corner] }}
                onPointerDown={(e) => startResize(e, corner)}
              />
            ))}
          </div>
        </div>

        <p className="field-hint">Drag the selection to move it, drag the corners to resize.</p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={!image}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
