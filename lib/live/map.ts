import type { BookSide, SimParams } from "@/lib/sim";
import type { LiveEstimate } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Live L1 → model params. Does not touch r0, L, φ, seed, or side. */
export function estimateToParams(
  est: LiveEstimate,
  joinSide: BookSide,
): Partial<SimParams> {
  const buy = joinSide === "bid";
  return {
    n0: clamp(Math.round(buy ? est.bidLots : est.askLots), 0, 20_000),
    qOpp0: clamp(Math.round(buy ? est.askLots : est.bidLots), 1, 20_000),
    lambda: clamp(round(buy ? est.lambdaBid : est.lambdaAsk, 2), 0, 20_000),
    lambdaOpp: clamp(round(buy ? est.lambdaAsk : est.lambdaBid, 2), 0, 20_000),
    mu: clamp(round(buy ? est.muBid : est.muAsk, 2), 1, 20_000),
    muOpp: clamp(round(buy ? est.muAsk : est.muBid, 2), 0, 20_000),
    theta: clamp(round(buy ? est.thetaBid : est.thetaAsk, 4), 0, 40),
    sigma: clamp(round(est.sigma, 3), 0, 3),
    spread: clamp(est.spreadTicks, 1, 50),
    mid0: Number.isFinite(est.mid) ? round(est.mid, 2) : 100,
  };
}
