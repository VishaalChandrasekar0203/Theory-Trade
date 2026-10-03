/**
 * Closed-form layer — the recommendation thermometer.
 *
 * Discrete-event simulation is the source of truth for a seeded tape.
 * These formulas score actions instantly without Monte Carlo.
 *
 * Time unit: seconds (params rates are per simulated second).
 * Convert to ms at the UI boundary.
 *
 * P(fill) = P(T_fill < τ) with τ ~ Exp(ν) is the survival e^{-ν T_fill}.
 * The plan's displayed identity "1 - e^{-ν T_fill}" is the vanish CDF,
 * which would invert the §2.7 limits (ν→0 ⇒ 1, T_fill→0 ⇒ 1). We
 * implement the prose and the tests, not that CDF typo.
 */

import type { SimParams, SimState } from "./types";
import { isResting } from "./types";

/** Vanish-rate add-on: κ_σ in 1/s per unit σ. Documented default. */
export const KAPPA_SIGMA = 20;

/**
 * Adverse-selection coefficient: E[Δm | touch fill] in mid-return
 * units per unit σ. Start at 1; README documents the unit.
 */
export const CHI = 1;

/** Take (reprice/cross) has a smaller AS coefficient than a passive fill. */
export const CHI_TAKE = 0.25;

/** Imbalance amplifier: joining the heavy side is more toxic. */
export const ETA = 1;

export function timeToFrontSeconds(
  n: number,
  mu: number,
  theta: number,
): number {
  if (n <= 0) return 0;
  if (mu <= 0) return Number.POSITIVE_INFINITY;
  // dn/dt = -μ - θ n. Time to n=0 is (1/θ) ln(1 + θ n / μ).
  if (theta <= 0) return n / mu;
  return (1 / theta) * Math.log(1 + (theta * n) / mu);
}

export function timeToFillSeconds(
  n: number,
  r: number,
  mu: number,
  theta: number,
): number {
  if (r <= 0) return 0;
  const front = timeToFrontSeconds(n, mu, theta);
  if (!Number.isFinite(front) || mu <= 0) return Number.POSITIVE_INFINITY;
  return front + r / mu;
}

/**
 * Competing-risk vanish rate (1/s): fluid time-to-zero of the opposite
 * queue plus a volatility-driven jump clock.
 */
export function vanishRatePerSecond(
  muOpp: number,
  qOpp: number,
  sigma: number,
): number {
  return muOpp / Math.max(qOpp, 1) + KAPPA_SIGMA * sigma;
}

/**
 * P(T_fill < τ) for deterministic T_fill and τ ~ Exp(ν).
 * = e^{-ν T_fill}. Limits: ν→0 ⇒ 1; T→0 ⇒ 1; T→∞ ⇒ 0.
 */
export function fillProbability(tFillSec: number, nu: number): number {
  if (tFillSec <= 0) return 1;
  if (!Number.isFinite(tFillSec)) return 0;
  if (nu <= 0) return 1;
  return Math.exp(-nu * tFillSec);
}

/**
 * E[min(T_fill, τ)] = (1 - e^{-ν T}) / ν for ν > 0.
 * Conditional on fill, E[W | fill] ≈ T_fill (fluid).
 */
export function expectedWaitSeconds(tFillSec: number, nu: number): number {
  if (tFillSec <= 0) return 0;
  if (!Number.isFinite(tFillSec)) {
    return nu > 0 ? 1 / nu : Number.POSITIVE_INFINITY;
  }
  if (nu <= 0) return tFillSec;
  return (1 - Math.exp(-nu * tFillSec)) / nu;
}

/**
 * Latency race. Piecewise fluid rule from the plan:
 * - n = 0: P(at least one 1-share hit in L) = 1 - e^{-μ L}
 *           expected shares = min(r, μ L)
 * - n > 0: P(reach front in L) = 1[T_front ≤ L] (sharp fluid)
 */
export function fillDuringLatency(args: {
  n: number;
  r: number;
  mu: number;
  theta: number;
  latencySec: number;
}): { pAtLeastOne: number; expectedShares: number; reachesFront: boolean } {
  const { n, r, mu, theta, latencySec } = args;
  if (r <= 0 || latencySec <= 0 || mu <= 0) {
    return { pAtLeastOne: 0, expectedShares: 0, reachesFront: n <= 0 };
  }
  if (n <= 0) {
    const p = 1 - Math.exp(-mu * latencySec);
    return {
      pAtLeastOne: p,
      expectedShares: Math.min(r, mu * latencySec),
      reachesFront: true,
    };
  }
  const tFront = timeToFrontSeconds(n, mu, theta);
  const reachesFront = tFront <= latencySec;
  if (!reachesFront) {
    return { pAtLeastOne: 0, expectedShares: 0, reachesFront: false };
  }
  const remaining = Math.max(0, latencySec - tFront);
  const expectedShares = Math.min(r, mu * remaining);
  const pAtLeastOne = remaining > 0 ? 1 - Math.exp(-mu * remaining) : 0;
  return { pAtLeastOne, expectedShares, reachesFront: true };
}

export function queueImbalance(ourQueue: number, oppQueue: number): number {
  const den = ourQueue + oppQueue;
  if (den <= 0) return 0;
  return (ourQueue - oppQueue) / den;
}

/** χ_eff = χ (1 + η (B−A)/(B+A)) — heavy-side join is more toxic. */
export function chiEffective(
  ourQueue: number,
  oppQueue: number,
  chi: number = CHI,
): number {
  return chi * (1 + ETA * queueImbalance(ourQueue, oppQueue));
}

export function fillCostPerShare(args: {
  spread: number;
  sigma: number;
  ourQueue: number;
  oppQueue: number;
}): number {
  const as = chiEffective(args.ourQueue, args.oppQueue) * args.sigma;
  return -args.spread / 2 + as;
}

export function takeCostPerShare(spread: number, sigma: number): number {
  return spread / 2 + CHI_TAKE * sigma;
}

export function unfillCostPerShare(spread: number, mustExecute: boolean): number {
  return mustExecute ? spread / 2 : 0;
}

export function expectedCost(pFill: number, cFill: number, cUnfill: number): number {
  return pFill * cFill + (1 - pFill) * cUnfill;
}

/** AS = χ σ P(fill) — always shown, even when folded into C. */
export function adverseSelectionComponent(
  pFill: number,
  sigma: number,
  ourQueue: number,
  oppQueue: number,
): number {
  return chiEffective(ourQueue, oppQueue) * sigma * pFill;
}

export function inventoryPenalty(
  inventory: number,
  target: number,
  phi: number,
): number {
  const d = inventory - target;
  return phi * d * d;
}

export function remainingSeconds(state: SimState, params: SimParams): number {
  return Math.max(0, (params.horizonMs - state.t) / 1000);
}

export function scoreHorizonSeconds(
  state: SimState,
  params: SimParams,
  tFillSec: number,
): number {
  const remain = remainingSeconds(state, params);
  const latencySec = params.latencyMs / 1000;
  const nu = vanishRatePerSecond(params.muOpp, state.oppQueue, params.sigma);
  const invNu = nu > 0 ? 1 / nu : Number.POSITIVE_INFINITY;
  const fill = Number.isFinite(tFillSec) ? tFillSec : latencySec;
  const h = Math.max(latencySec, fill, Number.isFinite(invNu) ? invNu : latencySec);
  return Math.min(remain, h);
}

export interface Thermometer {
  tFrontSec: number;
  tFillSec: number;
  nu: number;
  pFill: number;
  expectedWaitSec: number;
  expectedWaitGivenFillSec: number;
  cost: number;
  as: number;
  cFill: number;
  imbalance: number;
}

/**
 * Closed-form snapshot for the current (or hypothetical join) position.
 * When not resting, uses n = ourQueue, r = r0 (join-at-back thermometer).
 */
export function thermometer(state: SimState, params: SimParams): Thermometer {
  const n = isResting(state) ? state.n : state.ourQueue;
  const r = isResting(state) ? state.r : params.r0;
  const tFrontSec = timeToFrontSeconds(n, params.mu, params.theta);
  const tFillRaw = timeToFillSeconds(n, r, params.mu, params.theta);
  const horizon = scoreHorizonSeconds(state, params, tFillRaw);
  const tFillSec = Math.min(tFillRaw, horizon);
  const nu = vanishRatePerSecond(params.muOpp, state.oppQueue, params.sigma);
  const pFill = fillProbability(tFillSec, nu);
  const cFill = fillCostPerShare({
    spread: params.spread,
    sigma: params.sigma,
    ourQueue: isResting(state) ? state.ourQueue : state.ourQueue + params.r0,
    oppQueue: state.oppQueue,
  });
  const cUnfill = unfillCostPerShare(params.spread, params.mustExecute);
  return {
    tFrontSec,
    tFillSec,
    nu,
    pFill,
    expectedWaitSec: expectedWaitSeconds(tFillSec, nu),
    expectedWaitGivenFillSec: tFillSec,
    cost: expectedCost(pFill, cFill, cUnfill),
    as: adverseSelectionComponent(
      pFill,
      params.sigma,
      isResting(state) ? state.ourQueue : state.ourQueue + params.r0,
      state.oppQueue,
    ),
    cFill,
    imbalance: queueImbalance(
      isResting(state) ? state.ourQueue : state.ourQueue + params.r0,
      state.oppQueue,
    ),
  };
}
