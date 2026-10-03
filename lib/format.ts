export function fmtNum(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return "∞";
  return x.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMs(x: number): string {
  if (!Number.isFinite(x)) return "∞";
  if (Math.abs(x) < 0.01) return `${x.toFixed(3)} ms`;
  return `${x.toFixed(2)} ms`;
}

export function fmtProb(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(3);
}

export function fmtTicks(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return "∞";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}`;
}

export function fmtInt(x: number): string {
  return Math.round(x).toLocaleString("en-US");
}

export function fmtRate(x: number): string {
  return `${Math.round(x).toLocaleString("en-US")}/s`;
}

export function fmtSignedInt(x: number): string {
  const n = Math.round(x);
  if (n > 0) return `+${n}`;
  return `${n}`;
}

export function fmtV(x: number): string {
  if (x === Number.NEGATIVE_INFINITY) return "—";
  if (!Number.isFinite(x)) return "∞";
  return x.toFixed(4);
}
