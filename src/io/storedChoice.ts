/** The last choice, if it's still a valid one. Storage can be unavailable: nothing depends on it. */
export function readStored<T extends string>(key: string, allowed: readonly T[]): T | "" {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : "";
  } catch {
    return "";
  }
}

export function storeChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience: the choice applies for now either way.
  }
}
