import type { AiProviderConfig } from "./aiClient";

/** How many requests run at once for a profile with "Parallel requests" ticked. Cloud APIs
 * handle this fine; a local KoboldCpp processes one request at a time, so it stays at 1 there. */
export const PARALLEL_REQUESTS = 4;

export function concurrencyFor(config: AiProviderConfig): number {
  return config.parallel ? PARALLEL_REQUESTS : 1;
}

/** Runs `fn` over `items` with at most `limit` calls in flight, returning results in input order.
 * Rejects with the first error; calls already running finish but their results are dropped. */
export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
