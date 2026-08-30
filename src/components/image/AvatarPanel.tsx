import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { useCardStore } from "../../state/cardStore";
import { AiImagePromptPanel } from "./AiImagePromptPanel";
import { CropDialog } from "./CropDialog";

const IMAGE_FILTERS = [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }];

export function AvatarPanel() {
  const card = useCardStore((s) => s.card);
  const avatarPng = useCardStore((s) => s.avatarPng);
  const setAvatarPng = useCardStore((s) => s.setAvatarPng);
  const [cropSource, setCropSource] = useState<Uint8Array | null>(null);
  const [isPromptPanelOpen, setIsPromptPanelOpen] = useState(false);

  const previewUrl = useMemo(
    () => (avatarPng ? URL.createObjectURL(new Blob([avatarPng], { type: "image/png" })) : null),
    [avatarPng],
  );
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function pickImage() {
    const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
    if (!selected || Array.isArray(selected)) return;
    const bytes = await invoke<number[]>("read_binary_file", { path: selected });
    setCropSource(Uint8Array.from(bytes));
  }

  return (
    <div className="avatar-panel">
      <div className="avatar-preview">
        {previewUrl ? <img src={previewUrl} alt="Avatar" /> : <div className="avatar-placeholder">No image</div>}
      </div>
      <button type="button" className="secondary" onClick={pickImage}>
        {avatarPng ? "Change image…" : "Choose image…"}
      </button>
      {card && (
        <button type="button" className="secondary" onClick={() => setIsPromptPanelOpen(true)}>
          Generate image prompt…
        </button>
      )}

      {cropSource && (
        <CropDialog
          sourceBytes={cropSource}
          onCancel={() => setCropSource(null)}
          onConfirm={(png) => {
            setAvatarPng(png);
            setCropSource(null);
          }}
        />
      )}

      {isPromptPanelOpen && card && (
        <AiImagePromptPanel card={card} onClose={() => setIsPromptPanelOpen(false)} />
      )}
    </div>
  );
}
