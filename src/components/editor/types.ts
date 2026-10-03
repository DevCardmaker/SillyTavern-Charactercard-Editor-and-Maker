import type { NormalizedCard } from "../../schema/normalize";

export interface TabProps {
  card: NormalizedCard;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onError: (message: string) => void;
  /** Switches the app to the Lorebooks mode (for handing a card's lorebook over to it). */
  onShowLorebooks?: () => void;
}
