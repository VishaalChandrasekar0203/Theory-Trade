import { describe, expect, it } from "vitest";
import {
  fillProbability,
  timeToFillSeconds,
  timeToFrontSeconds,
  vanishRatePerSecond,
  KAPPA_SIGMA,
} from "../lib/sim/formulas";

describe("T_front", () => {
  it("reduces to n/μ when θ = 0", () => {
    expect(timeToFrontSeconds(80, 4000, 0)).toBeCloseTo(80 / 4000, 12);
  });

  it("matches the log formula on a known (n, μ, θ) triple", () => {
    const n = 80;
    const mu = 4000;
    const theta = 8;
    const expected = (1 / theta) * Math.log(1 + (theta * n) / mu);
    expect(timeToFrontSeconds(n, mu, theta)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(0.01855250063978415, 12);
  });

  it("is 0 when already at the front", () => {
    expect(timeToFrontSeconds(0, 4000, 8)).toBe(0);
  });
});

describe("T_fill", () => {
  it("is T_front + r/μ", () => {
    const n = 80;
    const r = 100;
    const mu = 4000;
    const theta = 8;
    const expected = timeToFrontSeconds(n, mu, theta) + r / mu;
    expect(timeToFillSeconds(n, r, mu, theta)).toBeCloseTo(expected, 12);
  });
});

describe("P(fill)", () => {
  it("goes to 1 as ν → 0", () => {
    expect(fillProbability(0.05, 0)).toBe(1);
    expect(fillProbability(0.05, 1e-12)).toBeGreaterThan(0.999);
  });

  it("goes to 1 as T_fill → 0", () => {
    expect(fillProbability(0, 40)).toBe(1);
    expect(fillProbability(1e-12, 40)).toBeGreaterThan(0.999);
  });

  it("goes to 0 as T_fill → ∞", () => {
    expect(fillProbability(Number.POSITIVE_INFINITY, 1)).toBe(0);
    expect(fillProbability(1e6, 1)).toBeCloseTo(0, 5);
  });
});

describe("vanish rate", () => {
  it("is μ_opp / q_opp + κ_σ σ", () => {
    expect(vanishRatePerSecond(3500, 120, 0.4)).toBeCloseTo(
      3500 / 120 + KAPPA_SIGMA * 0.4,
      12,
    );
  });
});
