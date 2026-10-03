/** EWMA lives in the live adapter, never inside lib/sim. */
export function ewma(prev: number | null, next: number, alpha = 0.2): number {
  if (prev === null || !Number.isFinite(prev)) return next;
  if (!Number.isFinite(next)) return prev;
  return alpha * next + (1 - alpha) * prev;
}

export function ewmaFields<T extends Record<string, number>>(
  prev: T | null,
  next: T,
  keys: (keyof T)[],
  alpha = 0.2,
): T {
  if (!prev) return next;
  const out = { ...next };
  for (const key of keys) {
    out[key] = ewma(prev[key] as number, next[key] as number, alpha) as T[keyof T];
  }
  return out;
}
