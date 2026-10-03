"use client";

import { inventoryPenalty } from "@/lib/sim";
import { Mono, SectionLabel } from "@/components/ops";
import type { SimulationController } from "@/hooks/use-simulation";
import { fmtMs, fmtProb, fmtSignedInt, fmtTicks } from "@/lib/format";

export function MetricsBar({ sim }: { sim: SimulationController }) {
  const { thermo, state, params } = sim;
  const pi = inventoryPenalty(state.inventory, params.inventoryTarget, params.phi);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 border-zinc-800 px-3 py-2 lg:border-r lg:w-[42%]">
      <SectionLabel className="w-full">Metrics</SectionLabel>
      <Metric k="P(fill)" v={fmtProb(thermo.pFill)} />
      <Metric k="E[W]" v={fmtMs(thermo.expectedWaitSec * 1000)} />
      <Metric k="C" v={fmtTicks(thermo.cost)} />
      <Metric k="AS" v={fmtTicks(thermo.as)} tone="amber" />
      <Metric k="I" v={fmtSignedInt(state.inventory)} tone={Math.abs(state.inventory) > 50 ? "red" : undefined} />
      <Metric k="Π" v={fmtTicks(pi)} />
      <Metric k="filled" v={`${state.filledShares}`} tone="emerald" />
      <Metric k="IS" v={fmtTicks(state.realizedIs)} />
    </div>
  );
}

function Metric({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "amber" | "red" | "emerald";
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</span>
      <Mono className="text-[12px]" tone={tone}>
        {v}
      </Mono>
    </div>
  );
}
