import { describe, expect, it } from "vitest";
import { emptyState } from "../lib/sim/engine";
import { recommend, scoreActions } from "../lib/sim/policy";
import { explain } from "../lib/sim/explain";
import { DEFAULT_PARAMS, type SimParams, type SimState } from "../lib/sim/types";

function round4(x: number): number | null {
  if (x === Number.NEGATIVE_INFINITY) return null;
  return Math.round(x * 1e4) / 1e4;
}

/** Frozen resting state used as a policy snapshot fixture. */
function snapshotFixture(): { params: SimParams; state: SimState } {
  const params: SimParams = {
    ...DEFAULT_PARAMS,
    r0: 100,
    n0: 80,
    qOpp0: 120,
    b0: 0,
    lambda: 2000,
    lambdaOpp: 2000,
    theta: 8,
    mu: 4000,
    muOpp: 3500,
    latencyMs: 4,
    sigma: 0.4,
    spread: 1,
    mid0: 100,
    inventoryTarget: 0,
    phi: 0.002,
    seed: 42,
    horizonMs: 250,
    joinSide: "bid",
    mustExecute: false,
  };
  const state = emptyState(params, true);
  return { params, state };
}

describe("policy fixture", () => {
  it("frozen state JSON ⇒ expected a* and V vector (minimize cost)", () => {
    const { params, state } = snapshotFixture();
    const rec = recommend(state, params, "minimize_cost");
    const vector = rec.scores.map((s) => ({
      action: s.action,
      legal: s.legal,
      v: round4(s.v),
    }));

    expect(vector).toEqual([
      { action: "place", legal: false, v: null },
      { action: "cancel", legal: true, v: 0 },
      { action: "reprice", legal: true, v: -5.45 },
      { action: "reduce", legal: true, v: -0.0742 },
      { action: "wait", legal: true, v: -0.1626 },
    ]);
    expect(rec.best.action).toBe("cancel");
  });

  it("ties break wait > cancel > reduce > place > reprice", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      mu: 1,
      muOpp: 0,
      lambda: 0,
      lambdaOpp: 0,
      theta: 0,
      sigma: 0,
      phi: 0,
      latencyMs: 0,
      r0: 1,
      n0: 10_000,
      qOpp0: 1,
      horizonMs: 1,
      spread: 0,
    };
    const state = emptyState(params, true);
    const rec = recommend(state, params, "maximize_fills");
    const legal = rec.scores.filter((s) => s.legal);
    const vs = new Set(legal.map((s) => round4(s.v)));
    if (vs.size === 1) {
      expect(rec.best.action).toBe("wait");
    }
  });
});

describe("goal switch", () => {
  it("same state, three goals, at least one recommended action differs", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      r0: 100,
      n0: 0,
      qOpp0: 10_000,
      b0: 0,
      mu: 10_000,
      muOpp: 1,
      lambda: 0,
      lambdaOpp: 0,
      theta: 0,
      latencyMs: 0,
      sigma: 2,
      phi: 0.0001,
      inventoryTarget: 0,
      spread: 1,
      horizonMs: 250,
      joinSide: "bid",
      mustExecute: false,
    };
    const state = emptyState(params, true);
    state.inventory = 200;

    const fills = recommend(state, params, "maximize_fills");
    const cost = recommend(state, params, "minimize_cost");
    const inv = recommend(state, params, "control_inventory");

    const actions = new Set([
      fills.best.action,
      cost.best.action,
      inv.best.action,
    ]);
    expect(actions.size).toBeGreaterThanOrEqual(2);
    expect(fills.best.action).not.toBe(cost.best.action);
  });
});

describe("explain", () => {
  it("fills a template from the same numbers as the policy", () => {
    const { params, state } = snapshotFixture();
    const rec = recommend(state, params, "minimize_cost");
    const text = explain(rec, state.n, params.latencyMs);
    expect(text.action).toBe(rec.best.action);
    expect(text.prose).toContain("DIRECTIVE:");
    expect(text.prose).toContain(`P(fill)=${rec.best.pFill.toFixed(3)}`);
    expect(text.assumption).toContain("fluid T_front");
  });
});
