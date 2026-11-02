import { open } from "@tauri-apps/plugin-dialog";
import { readBinary } from "./rawFile";

const IMAGE_FILTERS = [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }];

/** Picks an image file and returns its bytes, or null if the dialog was cancelled. */
export async function pickImageFile(): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
  if (!selected || Array.isArray(selected)) return null;
  return { fileName: selected.split(/[\\/]/).pop() ?? selected, bytes: await readBinary(selected) };
}

async function drawScaled(bytes: Uint8Array, maxSide: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** The picture as a JPEG data URL of at most `maxSide` pixels, for a vision model: KoboldCpp
 * scales larger images down anyway, and cloud providers charge by size. */
export async function toVisionDataUrl(bytes: Uint8Array, maxSide = 1024): Promise<string> {
  return (await drawScaled(bytes, maxSide)).toDataURL("image/jpeg", 0.9);
}

/** The picture as PNG bytes at full size — the card's avatar, unless the user crops it. */
export async function toPngBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const canvas = await drawScaled(bytes, Number.MAX_SAFE_INTEGER);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be converted."))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
