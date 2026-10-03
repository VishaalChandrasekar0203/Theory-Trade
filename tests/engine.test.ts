import { describe, expect, it } from "vitest";
import {
  Simulation,
  assertBookInvariant,
  computeIntensities,
  totalIntensity,
} from "../lib/sim/engine";
import { DEFAULT_PARAMS, isResting, type SimEvent, type SimParams } from "../lib/sim/types";
import { SequenceRng, exponentialWaitingTime } from "../lib/sim/rng";

function waitOnlyParams(overrides: Partial<SimParams> = {}): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

describe("seed replay", () => {
  it("same seed + params + wait-only ⇒ identical event list", () => {
    const params = waitOnlyParams({ seed: 42 });
    const a = new Simulation(params, { startResting: true });
    const b = new Simulation(params, { startResting: true });
    a.runToEnd();
    b.runToEnd();
    expect(serialize(a.events)).toEqual(serialize(b.events));
    expect(a.events.length).toBeGreaterThan(10);
  });
});

describe("inverse-CDF next event", () => {
  it("mock uniforms produce the exact Δt and first event", () => {
    const params = waitOnlyParams({
      seed: 1,
      n0: 80,
      r0: 100,
      b0: 0,
      qOpp0: 120,
    });
    const uniforms = [0.5, 0.0];
    const sim = new Simulation(params, {
      startResting: true,
      rng: new SequenceRng(uniforms),
    });
    const rates = computeIntensities(sim.state, params);
    const lambdaTot = totalIntensity(rates);
    const expectedDt = exponentialWaitingTime(lambdaTot, 0.5);
    expect(expectedDt).toBeCloseTo(Math.log(2) / lambdaTot, 12);

    const produced = sim.step();
    expect(sim.state.t).toBeCloseTo(expectedDt, 12);
    expect(produced[0]?.kind).toBe("HIT_OURS");
  });
});

describe("FIFO tagged customer", () => {
  it("never fills us while n > 0", () => {
    const sim = new Simulation(waitOnlyParams({ seed: 7, n0: 40 }), {
      startResting: true,
    });
    sim.runToEnd();
    for (const event of sim.events) {
      if (event.kind === "OUR_FILL" || event.kind === "TOXIC_FILL") {
        expect(event.n === 0 || event.n === -1).toBe(true);
      }
    }
  });
});

describe("book conservation", () => {
  it("B = n + r + b after every event when resting", () => {
    const sim = new Simulation(waitOnlyParams({ seed: 11 }), { startResting: true });
    let steps = 0;
    while (!sim.state.ended && steps < 20_000) {
      sim.step();
      if (isResting(sim.state)) {
        expect(sim.state.ourQueue).toBe(sim.state.n + sim.state.r + sim.state.b);
      }
      assertBookInvariant(sim.state);
      steps += 1;
    }
    expect(sim.state.ended).toBe(true);
  });

  it("queues, n, r, b stay non-negative (n = -1 only when flat)", () => {
    const sim = new Simulation(waitOnlyParams({ seed: 13 }), { startResting: true });
    sim.runToEnd();
    for (const event of sim.events) {
      expect(event.ourQueue).toBeGreaterThanOrEqual(0);
      expect(event.oppQueue).toBeGreaterThanOrEqual(0);
      expect(event.r).toBeGreaterThanOrEqual(0);
      expect(event.b).toBeGreaterThanOrEqual(0);
      expect(event.n === -1 || event.n >= 0).toBe(true);
    }
  });
});

describe("place-at-back", () => {
  it("after ACK, n equals pre-insert our-side depth", () => {
    const params = waitOnlyParams({ n0: 40, r0: 25, latencyMs: 0 });
    const sim = new Simulation(params);
    expect(sim.state.ourQueue).toBe(40);
    const before = sim.state.ourQueue;
    const result = sim.submit("place");
    expect(result.ok).toBe(true);
    expect(sim.state.n).toBe(before);
    expect(sim.state.r).toBe(25);
    expect(sim.state.b).toBe(0);
    expect(sim.state.ourQueue).toBe(before + 25);
  });
});

describe("latency race", () => {
  it("n=0, large μ, cancel at t=0, huge L ⇒ fills before ACK", () => {
    const params = waitOnlyParams({
      n0: 0,
      r0: 50,
      b0: 0,
      qOpp0: 5_000,
      mu: 10_000,
      muOpp: 0,
      lambda: 0,
      lambdaOpp: 0,
      theta: 0,
      latencyMs: 20,
      horizonMs: 100,
      seed: 3,
    });
    const sim = new Simulation(params, { startResting: true });
    expect(sim.state.n).toBe(0);
    const submitted = sim.submit("cancel");
    expect(submitted.ok).toBe(true);
    expect(sim.state.flight?.action).toBe("cancel");

    const fills: SimEvent[] = [];
    while (!sim.state.ended && sim.state.t < 20) {
      const batch = sim.step();
      fills.push(...batch.filter((e) => e.kind === "TOXIC_FILL" || e.kind === "OUR_FILL"));
    }
    expect(fills.length).toBeGreaterThan(0);
    expect(sim.state.filledShares).toBeGreaterThan(0);
  });
});

function serialize(events: SimEvent[]) {
  return events.map((e) => ({
    t: e.t,
    kind: e.kind,
    n: e.n,
    r: e.r,
    b: e.b,
    ourQueue: e.ourQueue,
    oppQueue: e.oppQueue,
    inventory: e.inventory,
  }));
}
