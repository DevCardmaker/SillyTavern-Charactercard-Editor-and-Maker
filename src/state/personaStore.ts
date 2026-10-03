import { createBlankPersona } from "../schema/persona";
import { createCardStore, type CardStore } from "./cardStore";

/** Open personas — same tab/dirty/save mechanics as characters, kept in a separate store so the
 * Characters mode's group features (consistency check, Edit Group, lorebook sync…) never see them. */
export const usePersonaStore: CardStore = createCardStore(createBlankPersona);
