import { useEffect, useState } from "react";
import type { NormalizedCard } from "../schema/normalize";

type CountTokensFn = (text: string) => number;

/** gpt-tokenizer bundles its full cl100k_base BPE table, which alone accounts for most of the
 * app's ~2.3MB main chunk. It's only needed once the user starts typing, so it's loaded lazily
 * here instead of at startup — `impl` stays null until the dynamic import resolves (a beat after
 * the app first paints), and every token-count hook below returns null until then. */
let impl: CountTokensFn | null = null;
const loading = import("gpt-tokenizer").then((mod) => {
  impl = mod.countTokens;
});

function useTokenizerReady(): boolean {
  const [ready, setReady] = useState(impl !== null);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    loading.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** Token count for a single field, or null while the tokenizer is still loading / not needed. */
export function useTokenCount(text: string, enabled: boolean): number | null {
  const ready = useTokenizerReady();
  if (!enabled || !ready || !impl) return null;
  return impl(text);
}

/** Same 5 fields the per-field counters (BasicTab) cover — kept identical so the total isn't a
 * surprise sum that includes fields nobody sees a counter next to. */
export function useTotalTokenCount(card: NormalizedCard | null): number | null {
  const ready = useTokenizerReady();
  if (!card || !ready || !impl) return null;
  return (
    impl(card.description) +
    impl(card.personality) +
    impl(card.scenario) +
    impl(card.first_mes) +
    impl(card.mes_example)
  );
}
