import { AvatarPanel } from "../image/AvatarPanel";

/** The card's picture as a tab of its own, so the text tabs get the full width. */
export function AvatarTab() {
  return (
    <div className="tab-panel avatar-tab">
      <AvatarPanel />
    </div>
  );
}
