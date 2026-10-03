/**
 * Templated explanations. Numbers come from the policy; this file never
 * invents metrics or chooses the action.
 */

import type { Recommendation } from "./policy";
import { ACTION_LABELS, GOAL_LABELS, type GoalId, type TraderAction } from "./types";

export interface Explanation {
  action: TraderAction;
  goal: GoalId;
  p: number;
  c: number;
  pi: number;
  tFrontMs: number;
  tFillMs: number;
  nu: number;
  as: number;
  n: number;
  latencyMs: number;
  dominantTerm: "fill" | "cost" | "inventory";
  runnerUp: TraderAction | null;
  deltaV: number;
  prose: string;
  assumption: string;
}

const ASSUMPTION =
  "fluid T_front; vanish ~ Exp(ν); fills FIFO; cancel effective only after L";

function fmt(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return "∞";
  return x.toFixed(digits);
}

function dominantContribution(rec: Recommendation): {
  term: "fill" | "cost" | "inventory";
  deltaV: number;
} {
  const best = rec.best;
  const second = rec.second;
  if (!second) return { term: "fill", deltaV: 0 };
  const w = rec.weights;
  const dFill = w.wP * (best.pHat - second.pHat);
  const dCost = -w.wC * (best.cost - second.cost);
  const dInv = -w.wI * (best.deltaPi - second.deltaPi);
  const ranked: { term: "fill" | "cost" | "inventory"; value: number }[] = [
    { term: "fill", value: dFill },
    { term: "cost", value: dCost },
    { term: "inventory", value: dInv },
  ];
  ranked.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { term: ranked[0]!.term, deltaV: best.v - second.v };
}

export function explain(
  rec: Recommendation,
  n: number,
  latencyMs: number,
): Explanation {
  const { best, second, goal } = rec;
  const { term, deltaV } = dominantContribution(rec);
  const tFrontMs = best.tFrontSec * 1000;
  const tFillMs = best.tFillSec * 1000;
  const runner = second?.action ?? null;

  const termLine =
    term === "fill"
      ? `Waiting/taking fill probability dominates: ΔV vs ${runner ?? "n/a"} is driven by the P̂ term (w_P=${rec.weights.wP}).`
      : term === "cost"
        ? `Cost dominates: c_fill and AS move V(${best.action}) above ${runner ?? "n/a"} (w_C=${rec.weights.wC}).`
        : `Inventory penalty dominates: ΔΠ vs ${runner ?? "n/a"} is the largest contribution (w_I=${rec.weights.wI}).`;

  const toxic =
    best.as > 0 && best.cost > 0
      ? `c_fill is positive (toxic): AS ${fmt(best.as)} exceeds spread capture.`
      : `c_fill = ${fmt(best.cost)} ticks/share expected.`;

  const prose =
    `DIRECTIVE: ${ACTION_LABELS[best.action].toUpperCase()}. ` +
    `Goal = ${GOAL_LABELS[goal].toLowerCase()}. ` +
    `P(fill)=${fmt(best.pFill)} with n=${n}, T_front=${fmt(tFrontMs, 2)} ms, L=${fmt(latencyMs, 2)} ms. ` +
    `${toxic} ` +
    `${termLine} ` +
    `P̂=${fmt(best.pHat)}, C=${fmt(best.cost)}, ΔΠ=${fmt(best.deltaPi)}.`;

  return {
    action: best.action,
    goal,
    p: best.pFill,
    c: best.cost,
    pi: best.deltaPi,
    tFrontMs,
    tFillMs,
    nu: best.nu,
    as: best.as,
    n,
    latencyMs,
    dominantTerm: term,
    runnerUp: runner,
    deltaV,
    prose,
    assumption: ASSUMPTION,
  };
}
