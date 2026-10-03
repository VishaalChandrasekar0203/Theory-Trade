/** Trader action on the single tagged child order. */
export type TraderAction = "place" | "cancel" | "reprice" | "reduce" | "wait";

export type GoalId = "maximize_fills" | "minimize_cost" | "control_inventory";

export type BookSide = "bid" | "ask";

export type RestingSide = BookSide | "flat";

/**
 * DES event kinds. Clock events are the competing exponentials + ACK + END.
 * OUR_FILL / TOXIC_FILL / QUEUE_VANISH / PLACE_MISSED / ALREADY_FILLED are
 * derived tape events emitted while applying a clock event.
 */
export type EventKind =
  | "HIT_OURS"
  | "HIT_OPP"
  | "CXL_AHEAD"
  | "CXL_BEHIND"
  | "ARRIVE_BEHIND"
  | "ARRIVE_OPP"
  | "ACK"
  | "EPISODE_END"
  | "QUEUE_VANISH"
  | "OUR_FILL"
  | "TOXIC_FILL"
  | "PLACE_MISSED"
  | "ALREADY_FILLED"
  | "ACTION_REJECTED";

export const CLOCK_EVENTS = [
  "HIT_OURS",
  "HIT_OPP",
  "CXL_AHEAD",
  "CXL_BEHIND",
  "ARRIVE_BEHIND",
  "ARRIVE_OPP",
] as const satisfies readonly EventKind[];

export type ClockEventKind = (typeof CLOCK_EVENTS)[number];

export interface Flight {
  action: Exclude<TraderAction, "wait">;
  submitT: number;
  ackT: number;
  /** Book generation at submit; place fails if the touch vanished in flight. */
  bookGeneration: number;
  sizeAtSubmit: number;
}

export interface SimParams {
  /** Tagged child size to place (lots). */
  r0: number;
  /** Shares strictly ahead at a fresh join (also initial our-side depth). */
  n0: number;
  /** Opposite touch size (shares). */
  qOpp0: number;
  /** Shares already behind us when starting resting (tests). */
  b0: number;
  /** Limit-order arrivals behind us, shares / simulated second. */
  lambda: number;
  /** Opposite-side limit arrivals, shares / simulated second. */
  lambdaOpp: number;
  /** Cancellation rate per share / simulated second. */
  theta: number;
  /** Marketable hit rate on our touch, shares / simulated second. */
  mu: number;
  /** Marketable hit rate on the opposite touch, shares / simulated second. */
  muOpp: number;
  /** Deterministic ack delay (ms) for place/cancel/reprice/reduce. */
  latencyMs: number;
  /** Volatility used in adverse-selection and vanish-rate add-on. */
  sigma: number;
  /** Touch spread in tick value. MVP is one tick. */
  spread: number;
  /** Mid at episode start. */
  mid0: number;
  /** Inventory target I*. */
  inventoryTarget: number;
  /** Quadratic inventory penalty φ. */
  phi: number;
  /** mulberry32 seed. */
  seed: number;
  /** Episode horizon T (ms). */
  horizonMs: number;
  /** Side we join. */
  joinSide: BookSide;
  /**
   * If true, unfilled remainder costs +s/2 (parent must execute).
   * Market-maker default is false (opportunity cost 0).
   */
  mustExecute: boolean;
}

export const DEFAULT_PARAMS: SimParams = {
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

export interface SimState {
  /** Simulated time in milliseconds from episode start. */
  t: number;
  /** Our-side touch size in shares (includes us if resting). */
  ourQueue: number;
  /** Opposite-side touch size in shares. */
  oppQueue: number;
  /** Shares strictly ahead; -1 if not in the book. */
  n: number;
  /** Tagged remaining size; 0 if none. */
  r: number;
  /** Shares behind us; 0 if not in the book. */
  b: number;
  /** Signed inventory: buy fills +, sell fills −. */
  inventory: number;
  side: RestingSide;
  flight: Flight | null;
  mid: number;
  tickIndex: number;
  bookGeneration: number;
  filledShares: number;
  /** Realized implementation shortfall vs arrival mid, tick-value units. */
  realizedIs: number;
  ended: boolean;
  warnings: string[];
}

export interface SimEvent {
  t: number;
  kind: EventKind;
  note: string;
  ourQueue: number;
  oppQueue: number;
  n: number;
  r: number;
  b: number;
  inventory: number;
  filledDelta?: number;
}

export interface InventoryPoint {
  t: number;
  inventory: number;
}

export const GOAL_LABELS: Record<GoalId, string> = {
  maximize_fills: "Maximize fills",
  minimize_cost: "Minimize cost",
  control_inventory: "Control inventory",
};

export const ACTION_LABELS: Record<TraderAction, string> = {
  place: "Place",
  cancel: "Cancel",
  reprice: "Reprice",
  reduce: "Reduce size",
  wait: "Wait",
};

export const TIE_BREAK_ORDER: readonly TraderAction[] = [
  "wait",
  "cancel",
  "reduce",
  "place",
  "reprice",
];

export function isResting(state: SimState): boolean {
  return state.r >= 1 && state.n >= 0;
}

export function signedFill(side: BookSide): number {
  return side === "bid" ? 1 : -1;
}

export function cloneParams(params: SimParams): SimParams {
  return { ...params };
}
