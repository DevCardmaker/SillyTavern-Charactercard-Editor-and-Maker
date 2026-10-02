import { beforeEach, describe, expect, it } from "vitest";
import { useLorebookStore } from "./lorebookStore";

const book = (name: string) => ({ name, entries: [], extensions: {} });

describe("lorebookStore", () => {
  beforeEach(() => useLorebookStore.setState({ lorebooks: [], activeId: null }));

  it("only marks the active lorebook dirty on update", () => {
    const s = useLorebookStore.getState();
    s.loadLorebook(book("A"), "/a.json");
    s.loadLorebook(book("B"), "/b.json");
    useLorebookStore.getState().updateActive(book("B2"));

    const [a, b] = useLorebookStore.getState().lorebooks;
    expect(a.isDirty).toBe(false);
    expect(b).toMatchObject({ isDirty: true, book: { name: "B2" } });
  });

  it("activates the right-hand neighbour when the active tab closes, else the left one", () => {
    const s = useLorebookStore.getState();
    s.loadLorebook(book("A"), "/a.json");
    s.loadLorebook(book("B"), "/b.json");
    s.loadLorebook(book("C"), "/c.json");
    const [a, b, c] = useLorebookStore.getState().lorebooks;

    useLorebookStore.getState().setActive(b.id);
    useLorebookStore.getState().close(b.id);
    expect(useLorebookStore.getState().activeId).toBe(c.id);

    useLorebookStore.getState().close(c.id);
    expect(useLorebookStore.getState().activeId).toBe(a.id);

    useLorebookStore.getState().close(a.id);
    expect(useLorebookStore.getState().activeId).toBeNull();
  });
});
