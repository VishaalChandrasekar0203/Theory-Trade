"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mono, SectionLabel } from "@/components/ops";
import { ModelCard } from "@/components/model-card";
import type { SimulationController } from "@/hooks/use-simulation";
import { ACTION_LABELS, type TraderAction } from "@/lib/sim";
import { fmtProb, fmtTicks, fmtV } from "@/lib/format";

const ACTION_ORDER: TraderAction[] = ["place", "cancel", "reprice", "reduce", "wait"];

export function DirectivePanel({ sim }: { sim: SimulationController }) {
  const { rec, explanation } = sim;
  const legalScores = rec.scores.filter((s) => s.legal && Number.isFinite(s.v));
  const maxAbs = Math.max(0.001, ...legalScores.map((s) => Math.abs(s.v)));

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-zinc-800 p-3 lg:border-l">
      <SectionLabel>Directive</SectionLabel>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-lg font-semibold uppercase tracking-[0.14em] text-cyan-400">
          {ACTION_LABELS[rec.best.action]}
        </div>
        <Mono className="text-xs text-zinc-500">V={fmtV(rec.best.v)}</Mono>
      </div>

      <div className="flex flex-col gap-1">
        {ACTION_ORDER.map((action) => {
          const score = rec.scores.find((s) => s.action === action)!;
          const recommended = rec.best.action === action;
          const width = score.legal ? (Math.abs(score.v) / maxAbs) * 100 : 0;
          return (
            <button
              key={action}
              type="button"
              disabled={!score.legal}
              onClick={() => sim.submit(action)}
              className={`grid grid-cols-[88px_1fr_56px] items-center gap-2 rounded-sm px-1.5 py-1 text-left ring-1 ${
                recommended
                  ? "bg-cyan-950/60 ring-cyan-700"
                  : "ring-transparent hover:bg-zinc-900 disabled:opacity-40"
              }`}
            >
              <span className="text-[11px] uppercase tracking-wide text-zinc-300">
                {ACTION_LABELS[action]}
              </span>
              <div className="h-1.5 bg-zinc-900">
                <div
                  className={`h-full ${score.v >= 0 ? "bg-cyan-500" : "bg-amber-500"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <Mono className="text-right text-[11px]">{fmtV(score.v)}</Mono>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-600">
        Click any legal action to submit it. The highlighted row is argmax V(a), not a lock.
      </p>

      <Tabs defaultValue="walkthrough" className="gap-2">
        <TabsList variant="line" className="w-full justify-start rounded-none">
          <TabsTrigger value="walkthrough" className="text-[11px]">
            Equations
          </TabsTrigger>
          <TabsTrigger value="model" className="text-[11px]">
            Model card
          </TabsTrigger>
        </TabsList>
        <TabsContent value="walkthrough" className="flex flex-col gap-2">
          <p className="font-mono text-[11px] leading-relaxed text-zinc-300">{explanation.prose}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>
              P=<Mono>{fmtProb(explanation.p)}</Mono>
            </span>
            <span>
              C=<Mono>{fmtTicks(explanation.c)}</Mono>
            </span>
            <span>
              ΔΠ=<Mono>{fmtTicks(explanation.pi)}</Mono>
            </span>
            <span>
              AS=<Mono tone="amber">{fmtTicks(explanation.as)}</Mono>
            </span>
            <span>
              T_front=<Mono>{explanation.tFrontMs.toFixed(2)} ms</Mono>
            </span>
            <span>
              T_fill=<Mono>{explanation.tFillMs.toFixed(2)} ms</Mono>
            </span>
          </div>
          <p className="text-[10px] text-zinc-600">{explanation.assumption}</p>
          {explanation.runnerUp ? (
            <p className="text-[10px] text-zinc-600">
              Runner-up {ACTION_LABELS[explanation.runnerUp]} · ΔV={fmtV(explanation.deltaV)} ·
              dominant term {explanation.dominantTerm}
            </p>
          ) : null}
          <Button
            size="sm"
            className="rounded-sm"
            onClick={() => sim.submit(rec.best.action)}
            disabled={!rec.best.legal}
          >
            Submit {ACTION_LABELS[rec.best.action]}
          </Button>
        </TabsContent>
        <TabsContent value="model">
          <ModelCard sim={sim} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
