/**
 * Deterministic action policy. Not an LLM.
 *
 * V(a) = w_P P̂_a − w_C Ĉ_a − w_I ΔΠ_a
 * Illegal actions score −∞. Ties: wait > cancel > reduce > place > reprice.
 */

import { legalActions } from "./engine";
import {
  adverseSelectionComponent,
  expectedCost,
  fillCostPerShare,
  fillDuringLatency,
  fillProbability,
  inventoryPenalty,
  remainingSeconds,
  scoreHorizonSeconds,
  takeCostPerShare,
  timeToFillSeconds,
  timeToFrontSeconds,
  unfillCostPerShare,
  vanishRatePerSecond,
} from "./formulas";
import {
  TIE_BREAK_ORDER,
  isResting,
  signedFill,
  type GoalId,
  type SimParams,
  type SimState,
  type TraderAction,
} from "./types";

export interface GoalWeights {
  wP: number;
  wC: number;
  wI: number;
}

export const GOAL_WEIGHTS: Record<GoalId, GoalWeights> = {
  maximize_fills: { wP: 1, wC: 0.15, wI: 0.15 },
  minimize_cost: { wP: 0.15, wC: 1, wI: 0.25 },
  control_inventory: { wP: 0.15, wC: 0.25, wI: 1 },
};

export interface ActionScore {
  action: TraderAction;
  legal: boolean;
  v: number;
  pHat: number;
  cost: number;
  deltaPi: number;
  expectedInventory: number;
  pFill: number;
  tFrontSec: number;
  tFillSec: number;
  nu: number;
  as: number;
}

export interface Recommendation {
  best: ActionScore;
  second: ActionScore | null;
  scores: ActionScore[];
  weights: GoalWeights;
  goal: GoalId;
}

const ACTIONS: readonly TraderAction[] = [
  "place",
  "cancel",
  "reprice",
  "reduce",
  "wait",
];

function predictWaitLike(
  state: SimState,
  params: SimParams,
  n: number,
  r: number,
  ourQueueAfter: number,
): Pick<
  ActionScore,
  | "pHat"
  | "cost"
  | "deltaPi"
  | "expectedInventory"
  | "pFill"
  | "tFrontSec"
  | "tFillSec"
  | "nu"
  | "as"
> {
  const tFrontSec = timeToFrontSeconds(n, params.mu, params.theta);
  const tFillRaw = timeToFillSeconds(n, r, params.mu, params.theta);
  const horizon = scoreHorizonSeconds(state, params, tFillRaw);
  const tFillSec = Math.min(tFillRaw, horizon);
  const nu = vanishRatePerSecond(params.muOpp, state.oppQueue, params.sigma);
  const pFill = r > 0 ? fillProbability(tFillSec, nu) : 0;
  const expectedShares = r * pFill;
  const pHat = params.r0 > 0 ? expectedShares / params.r0 : 0;
  const cFill = fillCostPerShare({
    spread: params.spread,
    sigma: params.sigma,
    ourQueue: ourQueueAfter,
    oppQueue: state.oppQueue,
  });
  const cUnfill = unfillCostPerShare(params.spread, params.mustExecute);
  const cost = expectedCost(pFill, cFill, cUnfill);
  const eps = signedFill(params.joinSide);
  const expectedInventory = state.inventory + eps * expectedShares;
  const deltaPi =
    inventoryPenalty(expectedInventory, params.inventoryTarget, params.phi) -
    inventoryPenalty(state.inventory, params.inventoryTarget, params.phi);
  const as = adverseSelectionComponent(
    pFill,
    params.sigma,
    ourQueueAfter,
    state.oppQueue,
  );
  return {
    pHat,
    cost,
    deltaPi,
    expectedInventory,
    pFill,
    tFrontSec,
    tFillSec,
    nu,
    as,
  };
}

function scoreOne(
  action: TraderAction,
  state: SimState,
  params: SimParams,
  weights: GoalWeights,
  legal: boolean,
): ActionScore {
  if (!legal) {
    return {
      action,
      legal: false,
      v: Number.NEGATIVE_INFINITY,
      pHat: 0,
      cost: 0,
      deltaPi: 0,
      expectedInventory: state.inventory,
      pFill: 0,
      tFrontSec: 0,
      tFillSec: 0,
      nu: vanishRatePerSecond(params.muOpp, state.oppQueue, params.sigma),
      as: 0,
    };
  }

  const remain = remainingSeconds(state, params);
  const latencySec = params.latencyMs / 1000;
  const nu = vanishRatePerSecond(params.muOpp, state.oppQueue, params.sigma);
  const cUnfill = unfillCostPerShare(params.spread, params.mustExecute);
  const eps = signedFill(params.joinSide);

  let metrics: ReturnType<typeof predictWaitLike>;

  if (action === "wait") {
    if (!isResting(state) || remain <= 0) {
      metrics = {
        pHat: 0,
        cost: cUnfill,
        deltaPi: 0,
        expectedInventory: state.inventory,
        pFill: 0,
        tFrontSec: 0,
        tFillSec: 0,
        nu,
        as: 0,
      };
    } else {
      metrics = predictWaitLike(
        state,
        params,
        state.n,
        state.r,
        state.ourQueue,
      );
    }
  } else if (action === "place") {
    const nJoin = state.ourQueue;
    const rJoin = params.r0;
    metrics = predictWaitLike(
      state,
      params,
      nJoin,
      rJoin,
      nJoin + rJoin,
    );
  } else if (action === "cancel") {
    if (!isResting(state)) {
      metrics = {
        pHat: 0,
        cost: cUnfill,
        deltaPi: 0,
        expectedInventory: state.inventory,
        pFill: 0,
        tFrontSec: timeToFrontSeconds(state.n, params.mu, params.theta),
        tFillSec: 0,
        nu,
        as: 0,
      };
    } else {
      const race = fillDuringLatency({
        n: state.n,
        r: state.r,
        mu: params.mu,
        theta: params.theta,
        latencySec,
      });
      const expectedShares = race.expectedShares;
      const pFill = state.r > 0 ? expectedShares / state.r : 0;
      const pHat = params.r0 > 0 ? expectedShares / params.r0 : 0;
      const cFill = fillCostPerShare({
        spread: params.spread,
        sigma: params.sigma,
        ourQueue: state.ourQueue,
        oppQueue: state.oppQueue,
      });
      const cost = expectedCost(pFill, cFill, cUnfill);
      const expectedInventory = state.inventory + eps * expectedShares;
      const deltaPi =
        inventoryPenalty(expectedInventory, params.inventoryTarget, params.phi) -
        inventoryPenalty(state.inventory, params.inventoryTarget, params.phi);
      metrics = {
        pHat,
        cost,
        deltaPi,
        expectedInventory,
        pFill,
        tFrontSec: timeToFrontSeconds(state.n, params.mu, params.theta),
        tFillSec: timeToFillSeconds(state.n, state.r, params.mu, params.theta),
        nu,
        as: adverseSelectionComponent(
          pFill,
          params.sigma,
          state.ourQueue,
          state.oppQueue,
        ),
      };
    }
  } else if (action === "reduce") {
    const next = Math.floor(state.r / 2);
    if (next < 1) {
      return scoreOne("cancel", state, params, weights, legal);
    }
    metrics = predictWaitLike(state, params, state.n, next, state.n + next + state.b);
  } else {
    // reprice — take the far touch immediately (one-tick cross).
    const takeQty = isResting(state) ? Math.min(state.r, state.oppQueue) : 0;
    const pHat = params.r0 > 0 ? takeQty / params.r0 : 0;
    const pFill = isResting(state) && state.r > 0 ? takeQty / state.r : 0;
    const cTake = takeCostPerShare(params.spread, params.sigma);
    const cost =
      pFill * cTake + (1 - pFill) * cUnfill;
    const expectedInventory = state.inventory + eps * takeQty;
    const deltaPi =
      inventoryPenalty(expectedInventory, params.inventoryTarget, params.phi) -
      inventoryPenalty(state.inventory, params.inventoryTarget, params.phi);
    metrics = {
      pHat,
      cost,
      deltaPi,
      expectedInventory,
      pFill,
      tFrontSec: 0,
      tFillSec: 0,
      nu,
      as: CHI_TAKE_AS(pFill, params.sigma),
    };
  }

  const v =
    weights.wP * metrics.pHat -
    weights.wC * metrics.cost -
    weights.wI * metrics.deltaPi;

  return { action, legal: true, v, ...metrics };
}

function CHI_TAKE_AS(pFill: number, sigma: number): number {
  return 0.25 * sigma * pFill;
}

export function scoreActions(
  state: SimState,
  params: SimParams,
  goal: GoalId,
): ActionScore[] {
  const weights = GOAL_WEIGHTS[goal];
  const legal = legalActions(state);
  return ACTIONS.map((action) =>
    scoreOne(action, state, params, weights, legal.has(action)),
  );
}

export function recommend(
  state: SimState,
  params: SimParams,
  goal: GoalId,
): Recommendation {
  const scores = scoreActions(state, params, goal);
  const legal = scores.filter((s) => s.legal);
  legal.sort((a, b) => {
    if (b.v !== a.v) return b.v - a.v;
    return TIE_BREAK_ORDER.indexOf(a.action) - TIE_BREAK_ORDER.indexOf(b.action);
  });
  const best = legal[0] ?? scores.find((s) => s.action === "wait")!;
  const second = legal.find((s) => s.action !== best.action) ?? null;
  return { best, second, scores, weights: GOAL_WEIGHTS[goal], goal };
}
