/**
 * Discrete-event engine: competing M/M/1 touch queues with share-proportional
 * reneging, a FIFO tagged customer, and a deterministic latency channel.
 *
 * Intensities are per millisecond internally. Params are per simulated second.
 */

import { exponentialWaitingTime, Mulberry32, type Rng } from "./rng";
import {
  CLOCK_EVENTS,
  cloneParams,
  isResting,
  signedFill,
  type ClockEventKind,
  type EventKind,
  type Flight,
  type InventoryPoint,
  type SimEvent,
  type SimParams,
  type SimState,
  type TraderAction,
} from "./types";

export interface SimulationOptions {
  /** Start already resting at n0 with size r0 (engine tests). */
  startResting?: boolean;
  rng?: Rng;
}

export function emptyState(params: SimParams, startResting: boolean): SimState {
  if (startResting) {
    const n = params.n0;
    const r = params.r0;
    const b = params.b0;
    return {
      t: 0,
      ourQueue: n + r + b,
      oppQueue: params.qOpp0,
      n,
      r,
      b,
      inventory: 0,
      side: params.joinSide,
      flight: null,
      mid: params.mid0,
      tickIndex: 0,
      bookGeneration: 0,
      filledShares: 0,
      realizedIs: 0,
      ended: false,
      warnings: [],
    };
  }
  return {
    t: 0,
    ourQueue: params.n0,
    oppQueue: params.qOpp0,
    n: -1,
    r: 0,
    b: 0,
    inventory: 0,
    side: "flat",
    flight: null,
    mid: params.mid0,
    tickIndex: 0,
    bookGeneration: 0,
    filledShares: 0,
    realizedIs: 0,
    ended: false,
    warnings: [],
  };
}

export function assertBookInvariant(state: SimState): void {
  if (state.ourQueue < 0 || state.oppQueue < 0) {
    throw new Error(
      `Negative queue: our=${state.ourQueue} opp=${state.oppQueue}`,
    );
  }
  if (isResting(state)) {
    if (state.n < 0 || state.r < 1 || state.b < 0) {
      throw new Error(
        `Resting invariant: n=${state.n} r=${state.r} b=${state.b}`,
      );
    }
    const sum = state.n + state.r + state.b;
    if (sum !== state.ourQueue) {
      throw new Error(
        `Book conservation failed: n+r+b=${sum} ourQueue=${state.ourQueue}`,
      );
    }
  }
}

/** Intensities in 1/ms. Order of keys is the categorical tie order. */
export function computeIntensities(
  state: SimState,
  params: SimParams,
): Record<ClockEventKind, number> {
  const mu = params.mu / 1000;
  const muOpp = params.muOpp / 1000;
  const theta = params.theta / 1000;
  const lambda = params.lambda / 1000;
  const lambdaOpp = params.lambdaOpp / 1000;
  const resting = isResting(state);

  return {
    HIT_OURS: state.ourQueue > 0 ? mu : 0,
    HIT_OPP: state.oppQueue > 0 ? muOpp : 0,
    CXL_AHEAD: resting
      ? theta * state.n
      : state.ourQueue > 0
        ? theta * state.ourQueue
        : 0,
    CXL_BEHIND: resting ? theta * state.b : 0,
    ARRIVE_BEHIND: lambda,
    ARRIVE_OPP: lambdaOpp,
  };
}

export function totalIntensity(rates: Record<ClockEventKind, number>): number {
  let sum = 0;
  for (const kind of CLOCK_EVENTS) sum += rates[kind];
  return sum;
}

export function pickClockEvent(
  rates: Record<ClockEventKind, number>,
  total: number,
  u: number,
): ClockEventKind {
  let acc = 0;
  let last: ClockEventKind = CLOCK_EVENTS[0];
  for (const kind of CLOCK_EVENTS) {
    if (rates[kind] <= 0) continue;
    acc += rates[kind] / total;
    last = kind;
    if (u < acc) return kind;
  }
  return last;
}

function snapshot(state: SimState, kind: EventKind, note: string, filledDelta?: number): SimEvent {
  return {
    t: state.t,
    kind,
    note,
    ourQueue: state.ourQueue,
    oppQueue: state.oppQueue,
    n: state.n,
    r: state.r,
    b: state.b,
    inventory: state.inventory,
    filledDelta,
  };
}

function leaveBook(state: SimState): void {
  // Remaining behind-us shares stay on the touch; the tag is gone.
  state.n = -1;
  state.r = 0;
  state.b = 0;
  state.side = "flat";
}

function applyFill(state: SimState, params: SimParams, events: SimEvent[]): void {
  const side = params.joinSide;
  const eps = signedFill(side);
  const bid = side === "bid";
  const exec = bid ? state.mid - params.spread / 2 : state.mid + params.spread / 2;
  // Buy IS = exec − arrival mid; sell IS = arrival mid − exec.
  const isDelta = bid ? exec - params.mid0 : params.mid0 - exec;
  state.r -= 1;
  state.ourQueue -= 1;
  state.inventory += eps;
  state.filledShares += 1;
  state.realizedIs += isDelta;
  const toxic = state.flight?.action === "cancel";
  const kind: EventKind = toxic ? "TOXIC_FILL" : "OUR_FILL";
  const note = toxic
    ? `Toxic fill during cancel/ack race — 1 lot ${side}`
    : `Our fill — 1 lot ${side} @ ${exec.toFixed(3)}`;
  events.push(snapshot(state, kind, note, 1));
  if (state.r === 0) {
    leaveBook(state);
  }
}

function vanish(state: SimState, params: SimParams, events: SimEvent[]): void {
  const unfilled = isResting(state) ? state.r : 0;
  if (isResting(state)) {
    leaveBook(state);
  }
  state.ourQueue = 0;
  state.oppQueue = 0;
  const eps = signedFill(params.joinSide);
  // Price moved toward us: bid resters see mid up (ask depleted).
  state.mid += eps * params.spread;
  state.tickIndex += 1;
  state.bookGeneration += 1;
  events.push(
    snapshot(
      state,
      "QUEUE_VANISH",
      unfilled > 0
        ? `Opposite queue hit zero — tagged remainder ${unfilled} unfilled (off-touch)`
        : "Opposite queue hit zero — price moved, new touch reseeds",
    ),
  );
  // New inside: both touches reseed from the initial depths, no tagged order.
  state.ourQueue = params.n0;
  state.oppQueue = params.qOpp0;
}

function applyClock(
  state: SimState,
  params: SimParams,
  kind: ClockEventKind,
  events: SimEvent[],
): void {
  switch (kind) {
    case "HIT_OURS": {
      if (state.ourQueue <= 0) return;
      if (isResting(state) && state.n === 0) {
        applyFill(state, params, events);
        return;
      }
      if (isResting(state) && state.n > 0) {
        state.n -= 1;
      }
      state.ourQueue -= 1;
      events.push(snapshot(state, "HIT_OURS", "Hit our touch — 1 share from the front"));
      return;
    }
    case "HIT_OPP": {
      if (state.oppQueue <= 0) return;
      state.oppQueue -= 1;
      events.push(snapshot(state, "HIT_OPP", "Hit opposite touch — 1 share"));
      if (state.oppQueue === 0) vanish(state, params, events);
      return;
    }
    case "CXL_AHEAD": {
      if (isResting(state)) {
        if (state.n <= 0) return;
        state.n -= 1;
        state.ourQueue -= 1;
        events.push(snapshot(state, "CXL_AHEAD", "Cancel ahead — position improves"));
        return;
      }
      if (state.ourQueue <= 0) return;
      state.ourQueue -= 1;
      events.push(snapshot(state, "CXL_AHEAD", "Cancel on our touch (not in book)"));
      return;
    }
    case "CXL_BEHIND": {
      if (!isResting(state) || state.b <= 0) return;
      state.b -= 1;
      state.ourQueue -= 1;
      events.push(snapshot(state, "CXL_BEHIND", "Cancel behind — position unchanged"));
      return;
    }
    case "ARRIVE_BEHIND": {
      if (isResting(state)) {
        state.b += 1;
      }
      state.ourQueue += 1;
      events.push(
        snapshot(
          state,
          "ARRIVE_BEHIND",
          isResting(state) ? "Limit arrives behind us" : "Limit arrives on our touch",
        ),
      );
      return;
    }
    case "ARRIVE_OPP": {
      state.oppQueue += 1;
      events.push(snapshot(state, "ARRIVE_OPP", "Limit arrives on opposite touch"));
      return;
    }
  }
}

function applyAck(state: SimState, params: SimParams, events: SimEvent[]): void {
  const flight = state.flight;
  if (!flight) return;
  state.flight = null;
  const action = flight.action;

  if (action === "place") {
    if (flight.bookGeneration !== state.bookGeneration) {
      events.push(
        snapshot(state, "PLACE_MISSED", "Place ACK — touch vanished in flight; join missed"),
      );
      state.warnings = ["Place missed: queue vanished during latency."];
      return;
    }
    if (isResting(state)) {
      events.push(snapshot(state, "ACK", "Place ACK ignored — already in the book"));
      return;
    }
    const n = state.ourQueue;
    state.n = n;
    state.r = params.r0;
    state.b = 0;
    state.ourQueue = n + params.r0;
    state.side = params.joinSide;
    events.push(
      snapshot(state, "ACK", `Place ACK — joined back of ${params.joinSide} with n=${n}`),
    );
    return;
  }

  if (!isResting(state)) {
    events.push(
      snapshot(state, "ALREADY_FILLED", `${action} ACK — no live tagged order`),
    );
    return;
  }

  if (action === "cancel") {
    state.ourQueue -= state.r;
    leaveBook(state);
    events.push(snapshot(state, "ACK", "Cancel ACK — tagged order removed"));
    return;
  }

  if (action === "reduce") {
    const next = Math.floor(state.r / 2);
    const dropped = state.r - next;
    if (next < 1) {
      state.ourQueue -= state.r;
      leaveBook(state);
      events.push(snapshot(state, "ACK", "Reduce ACK — remainder 0, left the book"));
      return;
    }
    state.r = next;
    state.ourQueue -= dropped;
    events.push(snapshot(state, "ACK", `Reduce ACK — remaining size ${next}`));
    return;
  }

  // Reprice: cancel remainder and take the far touch (one-tick cross).
  const takeQty = Math.min(state.r, state.oppQueue);
  const leftover = state.r - takeQty;
  state.ourQueue -= state.r;
  leaveBook(state);
  if (takeQty > 0) {
    const side = params.joinSide;
    const eps = signedFill(side);
    const bid = side === "bid";
    // Crossing: buy the ask / sell the bid.
    const exec = bid ? state.mid + params.spread / 2 : state.mid - params.spread / 2;
    const isDelta = bid ? exec - params.mid0 : params.mid0 - exec;
    state.oppQueue -= takeQty;
    state.inventory += eps * takeQty;
    state.filledShares += takeQty;
    state.realizedIs += isDelta * takeQty;
    events.push(
      snapshot(
        state,
        "ACK",
        `Reprice ACK — took ${takeQty} at the far touch` +
          (leftover > 0 ? `, ${leftover} unfilled` : ""),
        takeQty,
      ),
    );
    if (state.oppQueue === 0) vanish(state, params, events);
  } else {
    events.push(snapshot(state, "ACK", "Reprice ACK — opposite empty, nothing taken"));
  }
}

export function legalActions(state: SimState): Set<TraderAction> {
  const legal = new Set<TraderAction>(["wait"]);
  if (state.ended) return legal;
  if (state.flight !== null) return legal;
  if (isResting(state)) {
    legal.add("cancel");
    legal.add("reduce");
    legal.add("reprice");
  } else {
    legal.add("place");
  }
  return legal;
}

export class Simulation {
  params: SimParams;
  rng: Rng;
  state: SimState;
  events: SimEvent[] = [];
  inventoryHistory: InventoryPoint[] = [];
  readonly startResting: boolean;

  constructor(params: SimParams, options: SimulationOptions = {}) {
    this.params = cloneParams(params);
    this.startResting = options.startResting ?? false;
    this.rng = options.rng ?? new Mulberry32(params.seed);
    this.state = emptyState(this.params, this.startResting);
    this.inventoryHistory = [{ t: 0, inventory: 0 }];
    assertBookInvariant(this.state);
  }

  reset(params?: SimParams, rng?: Rng): void {
    if (params) this.params = cloneParams(params);
    this.rng = rng ?? new Mulberry32(this.params.seed);
    this.state = emptyState(this.params, this.startResting);
    this.events = [];
    this.inventoryHistory = [{ t: 0, inventory: 0 }];
  }

  submit(action: TraderAction): { ok: boolean; warning?: string } {
    if (action === "wait") return { ok: true };
    if (this.state.ended) {
      return this.reject("Episode ended — action ignored.");
    }
    if (this.state.flight) {
      return this.reject("In-flight action — second request rejected.");
    }
    const legal = legalActions(this.state);
    if (!legal.has(action)) {
      return this.reject(`Action '${action}' is illegal in this state.`);
    }
    const L = Math.max(0, this.params.latencyMs);
    const flight: Flight = {
      action,
      submitT: this.state.t,
      ackT: this.state.t + L,
      bookGeneration: this.state.bookGeneration,
      sizeAtSubmit: action === "place" ? this.params.r0 : this.state.r,
    };
    this.state.flight = flight;
    if (L === 0) {
      const derived: SimEvent[] = [];
      applyAck(this.state, this.params, derived);
      this.pushEvents(derived);
      assertBookInvariant(this.state);
    }
    return { ok: true };
  }

  /** Advance one DES event. Returns the tape rows produced (may be several). */
  step(): SimEvent[] {
    if (this.state.ended) return [];
    const rates = computeIntensities(this.state, this.params);
    const lambdaTot = totalIntensity(rates);
    const tEnd = this.params.horizonMs;
    const tAck = this.state.flight ? this.state.flight.ackT : Number.POSITIVE_INFINITY;

    let tExp = Number.POSITIVE_INFINITY;
    if (lambdaTot > 0) {
      const uWait = this.rng.next();
      tExp = this.state.t + exponentialWaitingTime(lambdaTot, uWait);
    }

    // Book events win exact timestamp ties over ACK; END is last.
    const produced: SimEvent[] = [];
    if (tExp <= tAck && tExp <= tEnd) {
      this.state.t = tExp;
      const uWhich = this.rng.next();
      const kind = pickClockEvent(rates, lambdaTot, uWhich);
      applyClock(this.state, this.params, kind, produced);
    } else if (tAck <= tEnd) {
      this.state.t = tAck;
      applyAck(this.state, this.params, produced);
    } else {
      this.state.t = tEnd;
      this.state.ended = true;
      this.state.flight = null;
      produced.push(
        snapshot(
          this.state,
          "EPISODE_END",
          `Episode end — filled ${this.state.filledShares}, IS ${this.state.realizedIs.toFixed(4)}`,
        ),
      );
    }

    this.pushEvents(produced);
    assertBookInvariant(this.state);
    return produced;
  }

  runToEnd(maxSteps = 100_000): SimEvent[] {
    const all: SimEvent[] = [];
    let steps = 0;
    while (!this.state.ended && steps < maxSteps) {
      all.push(...this.step());
      steps += 1;
    }
    if (!this.state.ended) {
      throw new Error(`runToEnd exceeded ${maxSteps} steps`);
    }
    return all;
  }

  private reject(warning: string): { ok: boolean; warning: string } {
    this.state.warnings = [warning];
    this.events.push(snapshot(this.state, "ACTION_REJECTED", warning));
    return { ok: false, warning };
  }

  private pushEvents(events: SimEvent[]): void {
    for (const event of events) {
      this.events.push(event);
      const last = this.inventoryHistory[this.inventoryHistory.length - 1];
      if (!last || last.inventory !== this.state.inventory || last.t !== this.state.t) {
        this.inventoryHistory.push({
          t: this.state.t,
          inventory: this.state.inventory,
        });
      }
    }
  }
}
