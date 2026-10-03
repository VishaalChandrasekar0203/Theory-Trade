import { describe, expect, it } from "vitest";
import { estimateFromWindow } from "../lib/live/estimate";
import { estimateToParams } from "../lib/live/map";
import { ewma } from "../lib/live/ewma";
import type { BookSnapshot, Print } from "../lib/live/types";

describe("ewma", () => {
  it("returns the first sample when there is no previous value", () => {
    expect(ewma(null, 10)).toBe(10);
  });

  it("blends with α = 0.2", () => {
    expect(ewma(10, 20, 0.2)).toBeCloseTo(12, 12);
  });
});

describe("estimateFromWindow", () => {
  it("maps a known 2s window onto λ, μ, θ, n", () => {
    const snapshots: BookSnapshot[] = [
      { tMs: 0, bidLots: 100, askLots: 80, bid: 100, ask: 100.01, mid: 100.005 },
      { tMs: 1000, bidLots: 90, askLots: 85, bid: 100, ask: 100.01, mid: 100.005 },
      { tMs: 2000, bidLots: 110, askLots: 70, bid: 100, ask: 100.02, mid: 100.01 },
    ];
    const prints: Print[] = [
      { tMs: 400, lots: 20, price: 100, aggressor: "sell" },
      { tMs: 1500, lots: 10, price: 100.01, aggressor: "buy" },
    ];
    const est = estimateFromWindow({
      snapshots,
      prints,
      windowSec: 2,
      tickSize: 0.01,
    });
    expect(est).not.toBeNull();
    expect(est!.bidLots).toBe(110);
    expect(est!.askLots).toBe(70);
    expect(est!.muBid).toBeCloseTo(10, 6);
    expect(est!.muAsk).toBeCloseTo(5, 6);
    expect(est!.lambdaBid).toBeCloseTo(10, 6);
    expect(est!.spreadTicks).toBe(2);
  });

  it("maps bid vs ask join onto n and μ", () => {
    const est = {
      bidLots: 40,
      askLots: 90,
      lambdaBid: 1,
      lambdaAsk: 2,
      muBid: 10,
      muAsk: 20,
      thetaBid: 0.1,
      thetaAsk: 0.2,
      sigma: 0.3,
      spreadTicks: 1,
      mid: 100,
      windowSec: 10,
      thetaLowConfidence: false,
      sampleSnapshots: 5,
      samplePrints: 5,
    };
    const bid = estimateToParams(est, "bid");
    expect(bid.n0).toBe(40);
    expect(bid.mu).toBe(10);
    expect(bid.r0).toBeUndefined();
    expect(bid.latencyMs).toBeUndefined();
    expect(bid.phi).toBeUndefined();
    expect(bid.seed).toBeUndefined();
    expect(estimateToParams(est, "ask").n0).toBe(90);
    expect(estimateToParams(est, "ask").mu).toBe(20);
  });

  it("returns null with fewer than two snapshots", () => {
    expect(
      estimateFromWindow({
        snapshots: [
          { tMs: 0, bidLots: 10, askLots: 10, bid: 1, ask: 1.01, mid: 1.005 },
        ],
        prints: [],
        windowSec: 10,
        tickSize: 0.01,
      }),
    ).toBeNull();
  });
});
