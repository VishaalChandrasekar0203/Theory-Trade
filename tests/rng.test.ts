import { describe, expect, it } from "vitest";
import { Mulberry32, SequenceRng, exponentialWaitingTime } from "../lib/sim/rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("stays in [0, 1)", () => {
    const rng = new Mulberry32(1);
    for (let i = 0; i < 10_000; i += 1) {
      const u = rng.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("clone continues independently from the same state", () => {
    const rng = new Mulberry32(99);
    rng.next();
    rng.next();
    const clone = rng.clone();
    expect(clone.next()).toBe(rng.next());
  });
});

describe("inverse CDF", () => {
  it("maps mocked uniforms to exact Exp waiting times", () => {
    const rate = 2.5;
    const uniforms = [0.0, 0.5, 0.75];
    const rng = new SequenceRng(uniforms);
    const expected = uniforms.map((u) => -Math.log(1 - u) / rate);
    const got = uniforms.map(() => exponentialWaitingTime(rate, rng.next()));
    expect(got[0]).toBeCloseTo(0, 12);
    expect(got[1]).toBeCloseTo(Math.log(2) / rate, 12);
    expect(got[2]).toBeCloseTo(expected[2]!, 12);
  });
});
