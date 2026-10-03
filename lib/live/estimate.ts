/**
 * Map a rolling L1 + prints window onto model rates.
 *
 * n is touch size (join-the-back), not FIFO rank. θ is weakly identified.
 * Pure: no Date.now, no WebSocket, no Math.random.
 */

import type { LiveEstimate, MarketWindow, Print } from "./types";

const MU_FLOOR = 1;

function inWindow<T extends { tMs: number }>(rows: T[], tEnd: number, windowMs: number): T[] {
  const tStart = tEnd - windowMs;
  return rows.filter((row) => row.tMs >= tStart && row.tMs <= tEnd);
}

function printsBetween(prints: Print[], t0: number, t1: number): Print[] {
  return prints.filter((p) => p.tMs > t0 && p.tMs <= t1);
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varSum = xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, varSum));
}

export function estimateFromWindow(input: MarketWindow): LiveEstimate | null {
  const windowMs = Math.max(1, input.windowSec) * 1000;
  if (input.snapshots.length === 0) return null;
  const tEnd = input.snapshots[input.snapshots.length - 1]!.tMs;
  const snapshots = inWindow(input.snapshots, tEnd, windowMs).sort((a, b) => a.tMs - b.tMs);
  const prints = inWindow(input.prints, tEnd, windowMs);
  if (snapshots.length < 2) return null;

  const W = Math.max((snapshots[snapshots.length - 1]!.tMs - snapshots[0]!.tMs) / 1000, 1e-6);
  const last = snapshots[snapshots.length - 1]!;
  const tick = input.tickSize > 0 ? input.tickSize : 0.01;

  let lambdaBid = 0;
  let lambdaAsk = 0;
  let cxlBid = 0;
  let cxlAsk = 0;
  let hitBidFromBook = 0;
  let hitAskFromBook = 0;

  for (let i = 1; i < snapshots.length; i += 1) {
    const prev = snapshots[i - 1]!;
    const cur = snapshots[i]!;
    const dBid = cur.bidLots - prev.bidLots;
    const dAsk = cur.askLots - prev.askLots;
    const intervalPrints = printsBetween(prints, prev.tMs, cur.tMs);
    const xBid = intervalPrints
      .filter((p) => p.aggressor === "sell")
      .reduce((s, p) => s + p.lots, 0);
    const xAsk = intervalPrints
      .filter((p) => p.aggressor === "buy")
      .reduce((s, p) => s + p.lots, 0);
    lambdaBid += Math.max(dBid, 0);
    lambdaAsk += Math.max(dAsk, 0);
    cxlBid += Math.max(-dBid - xBid, 0);
    cxlAsk += Math.max(-dAsk - xAsk, 0);
    hitBidFromBook += xBid;
    hitAskFromBook += xAsk;
  }

  const muBidPrints = prints
    .filter((p) => p.aggressor === "sell")
    .reduce((s, p) => s + p.lots, 0);
  const muAskPrints = prints
    .filter((p) => p.aggressor === "buy")
    .reduce((s, p) => s + p.lots, 0);

  const meanBid =
    snapshots.reduce((s, z) => s + z.bidLots, 0) / snapshots.length;
  const meanAsk =
    snapshots.reduce((s, z) => s + z.askLots, 0) / snapshots.length;

  const dt: number[] = [];
  const dTicks: number[] = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    const dtSec = (snapshots[i]!.tMs - snapshots[i - 1]!.tMs) / 1000;
    if (dtSec <= 0) continue;
    dt.push(dtSec);
    dTicks.push((snapshots[i]!.mid - snapshots[i - 1]!.mid) / tick);
  }
  const meanDt = dt.length ? dt.reduce((a, b) => a + b, 0) / dt.length : 1;
  const sigma = stdev(dTicks) * Math.sqrt(1 / Math.max(meanDt, 1e-6));

  const spreadTicks = Math.max(1, Math.round((last.ask - last.bid) / tick));

  const thetaLowConfidence =
    prints.length < 3 ||
    Math.abs(hitBidFromBook + hitAskFromBook - (muBidPrints + muAskPrints)) >
      Math.max(1, meanBid + meanAsk);

  return {
    bidLots: Math.max(0, Math.round(last.bidLots)),
    askLots: Math.max(0, Math.round(last.askLots)),
    lambdaBid: lambdaBid / W,
    lambdaAsk: lambdaAsk / W,
    muBid: Math.max(MU_FLOOR, muBidPrints / W),
    muAsk: Math.max(MU_FLOOR, muAskPrints / W),
    thetaBid: meanBid > 0 ? cxlBid / (meanBid * W) : 0,
    thetaAsk: meanAsk > 0 ? cxlAsk / (meanAsk * W) : 0,
    sigma,
    spreadTicks,
    mid: last.mid,
    windowSec: input.windowSec,
    thetaLowConfidence,
    sampleSnapshots: snapshots.length,
    samplePrints: prints.length,
  };
}
