import { beforeEach, describe, expect, it, vi } from "vitest";

// cardStore calls into io/autosave on tab switch/close — isolate that from the real Tauri IPC
// plumbing here, this file is purely about the store's slot bookkeeping.
const writeAutosaveMock = vi.fn();
const clearAutosaveMock = vi.fn();
vi.mock("../io/autosave", () => ({
  writeAutosave: (...args: unknown[]) => writeAutosaveMock(...args),
  clearAutosave: (...args: unknown[]) => clearAutosaveMock(...args),
}));

const { useCardStore } = await import("./cardStore");

beforeEach(() => {
  useCardStore.setState({
    characters: [],
    activeId: null,
    groupFolder: null,
    card: null,
    avatarPng: null,
    currentFilePath: null,
    currentFileFormat: null,
    isDirty: false,
  });
  writeAutosaveMock.mockReset();
  clearAutosaveMock.mockReset();
});

describe("cardStore — multiple simultaneously open characters", () => {
  it("newCard adds a tab and activates it, leaving other open tabs untouched", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId;
    useCardStore.getState().updateCard({ name: "Father" });

    useCardStore.getState().newCard();
    useCardStore.getState().updateCard({ name: "Mother" });

    expect(useCardStore.getState().characters).toHaveLength(2);
    expect(useCardStore.getState().characters.find((c) => c.id === firstId)?.card.name).toBe("Father");
    expect(useCardStore.getState().card?.name).toBe("Mother");
  });

  it("switching tabs restores each slot's own edits and autosaves the outgoing one", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId as string;
    useCardStore.getState().updateCard({ name: "Father" });

    // newCard() also leaves the previously active tab behind, so it autosaves too — not just
    // setActiveCharacter.
    useCardStore.getState().newCard();
    useCardStore.getState().updateCard({ name: "Mother" });
    expect(writeAutosaveMock).toHaveBeenCalledTimes(1);
    expect(writeAutosaveMock.mock.calls[0]?.[1]?.name).toBe("Father");

    useCardStore.getState().setActiveCharacter(firstId);

    expect(useCardStore.getState().activeId).toBe(firstId);
    expect(useCardStore.getState().card?.name).toBe("Father");
    expect(writeAutosaveMock).toHaveBeenCalledTimes(2);
    expect(writeAutosaveMock.mock.calls[1]?.[1]?.name).toBe("Mother");
  });

  it("newCard/loadCard also autosave the tab they leave behind, not just setActiveCharacter", () => {
    useCardStore.getState().newCard();
    expect(writeAutosaveMock).not.toHaveBeenCalled(); // nothing to leave behind yet

    useCardStore.getState().updateCard({ name: "First Child" });
    useCardStore.getState().newCard();

    expect(writeAutosaveMock).toHaveBeenCalledTimes(1);
    expect(writeAutosaveMock.mock.calls[0]?.[1]?.name).toBe("First Child");
  });

  it("setActiveCharacter with the already-active id is a no-op (no redundant autosave)", () => {
    useCardStore.getState().newCard();
    const id = useCardStore.getState().activeId as string;

    useCardStore.getState().setActiveCharacter(id);

    expect(writeAutosaveMock).not.toHaveBeenCalled();
  });

  it("updateCard/setAvatarPng/markSaved only ever touch the active slot", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId as string;
    useCardStore.getState().newCard();

    useCardStore.getState().markSaved("/tmp/Mother.json", "json");
    useCardStore.getState().setAvatarPng(new Uint8Array([1, 2, 3]));

    const first = useCardStore.getState().characters.find((c) => c.id === firstId);
    expect(first?.currentFilePath).toBeNull();
    expect(first?.avatarPng).toBeNull();
    expect(useCardStore.getState().currentFilePath).toBe("/tmp/Mother.json");
    expect(useCardStore.getState().avatarPng).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("updateSlotCard patches an arbitrary slot without changing which tab is active", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId as string;
    useCardStore.getState().updateCard({ name: "Father" });
    useCardStore.getState().newCard();
    const secondId = useCardStore.getState().activeId as string;
    useCardStore.getState().updateCard({ name: "Mother" });

    useCardStore.getState().updateSlotCard(firstId, { scenario: "New setting" });

    expect(useCardStore.getState().activeId).toBe(secondId);
    expect(useCardStore.getState().characters.find((c) => c.id === firstId)?.card.scenario).toBe("New setting");
    expect(useCardStore.getState().characters.find((c) => c.id === firstId)?.isDirty).toBe(true);
    expect(useCardStore.getState().card?.scenario).not.toBe("New setting");
  });

  it("closeCharacter on the active tab falls back to a remaining tab and clears its autosave", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId as string;
    useCardStore.getState().newCard();
    const secondId = useCardStore.getState().activeId as string;

    useCardStore.getState().closeCharacter(secondId);

    expect(useCardStore.getState().characters).toHaveLength(1);
    expect(useCardStore.getState().activeId).toBe(firstId);
    expect(useCardStore.getState().card).not.toBeNull();
    expect(clearAutosaveMock).toHaveBeenCalledWith(secondId);
  });

  it("closeCharacter on an inactive tab leaves the active one untouched", () => {
    useCardStore.getState().newCard();
    const firstId = useCardStore.getState().activeId as string;
    useCardStore.getState().newCard();
    const secondId = useCardStore.getState().activeId as string;

    useCardStore.getState().closeCharacter(firstId);

    expect(useCardStore.getState().activeId).toBe(secondId);
    expect(useCardStore.getState().characters).toHaveLength(1);
  });

  it("closing the last tab returns to the empty state", () => {
    useCardStore.getState().newCard();
    const id = useCardStore.getState().activeId as string;

    useCardStore.getState().closeCharacter(id);

    expect(useCardStore.getState().characters).toHaveLength(0);
    expect(useCardStore.getState().activeId).toBeNull();
    expect(useCardStore.getState().card).toBeNull();
  });
});
