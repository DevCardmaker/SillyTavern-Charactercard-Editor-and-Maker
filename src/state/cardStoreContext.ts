import { createContext, useContext } from "react";
import { type CardStore, useCardStore } from "./cardStore";

/** Which card store the components below operate on — characters by default; the Personas mode
 * provides `usePersonaStore`, so shared components (avatar panel, …) work in both. */
export const CardStoreContext = createContext<CardStore>(useCardStore);

export function useActiveCardStore(): CardStore {
  return useContext(CardStoreContext);
}
