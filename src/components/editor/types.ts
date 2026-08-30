import type { NormalizedCard } from "../../schema/normalize";

export interface TabProps {
  card: NormalizedCard;
  onChange: (patch: Partial<NormalizedCard>) => void;
  onError: (message: string) => void;
}
