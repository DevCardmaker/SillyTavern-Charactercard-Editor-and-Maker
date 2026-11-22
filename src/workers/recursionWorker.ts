/// <reference lib="webworker" />
import type { Lorebook } from "../schema/lorebook";
import { recursionMap, type KeyTestSettings } from "../schema/lorebookKeyTest";

/** Works out the recursion map away from the window, so a huge lorebook doesn't freeze the app. */
self.onmessage = (event: MessageEvent<{ id: number; book: Lorebook; settings: KeyTestSettings }>) => {
  const { id, book, settings } = event.data;
  self.postMessage({ id, map: recursionMap(book, settings) });
};
