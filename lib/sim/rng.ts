/**
 * Seedable PRNG for the discrete-event engine.
 *
 * The engine must never call Math.random() or read the wall clock.
 * Same seed ⇒ same Unif(0,1) stream ⇒ byte-identical event traces.
 */

export interface Rng {
  /** Draw U ~ Unif(0, 1). Guaranteed < 1 so -ln(1-U) is finite. */
  next(): number;
}

/**
 * Mulberry32 — 32-bit, tiny, easy to port.
 * See https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export class Mulberry32 implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let r = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  clone(): Mulberry32 {
    const copy = new Mulberry32(0);
    copy.state = this.state;
    return copy;
  }
}

/** Deterministic sequence of uniforms for inverse-CDF unit tests. */
export class SequenceRng implements Rng {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    if (this.index >= this.values.length) {
      throw new Error(
        `SequenceRng exhausted after ${this.values.length} draws`,
      );
    }
    const u = this.values[this.index]!;
    this.index += 1;
    if (u < 0 || u >= 1) {
      throw new Error(`SequenceRng values must be in [0, 1); got ${u}`);
    }
    return u;
  }
}

/**
 * Inverse-CDF draw of Exp(rate) in the same time unit as `rate`.
 * Δt = -ln(1-U) / Λ. Rate 0 is treated as +∞ (event never fires).
 */
export function exponentialWaitingTime(rate: number, u: number): number {
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  const clamped = u >= 1 ? 1 - Number.EPSILON : u;
  return -Math.log(1 - clamped) / rate;
}
