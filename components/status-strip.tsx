"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ops";
import type { SimulationController } from "@/hooks/use-simulation";
import { GOAL_LABELS } from "@/lib/sim";
import { fmtInt, fmtMs } from "@/lib/format";

const STATUS_TONE: Record<
  SimulationController["status"],
  { label: string; className: string }
> = {
  idle: { label: "IDLE", className: "border-zinc-700 text-zinc-400" },
  running: { label: "RUNNING", className: "border-cyan-700 text-cyan-400" },
  paused: { label: "PAUSED", className: "border-amber-700 text-amber-400" },
  ended: { label: "ENDED", className: "border-zinc-600 text-zinc-300" },
  inflight: { label: "IN FLIGHT", className: "border-amber-600 text-amber-400" },
};

export function StatusStrip({ sim }: { sim: SimulationController }) {
  const st = STATUS_TONE[sim.status];
  return (
    <header className="flex flex-col gap-2 border-b border-zinc-800 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">
          Theory Trade
        </div>
        <span className="text-zinc-600">·</span>
        <span className="uppercase tracking-[0.16em] text-zinc-400">
          {sim.liveEnabled ? sim.liveProduct : "Symbol DEMO"}
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          t=<Mono className="text-zinc-200">{fmtMs(sim.state.t)}</Mono>
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          seed=<Mono className="text-zinc-200">{fmtInt(sim.params.seed)}</Mono>
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          goal=<Mono className="text-zinc-200">{GOAL_LABELS[sim.goal]}</Mono>
        </span>
        <span className="text-zinc-600">·</span>
        <Badge variant="outline" className={`rounded-sm font-mono text-[10px] ${st.className}`}>
          {st.label}
        </Badge>
        {sim.liveEnabled ? (
          <Badge
            variant="outline"
            className={`rounded-sm font-mono text-[10px] ${
              sim.liveStatus === "live"
                ? "border-emerald-700 text-emerald-400"
                : sim.liveStatus === "frozen"
                  ? "border-cyan-700 text-cyan-400"
                  : sim.liveStatus === "stale" || sim.liveStatus === "error"
                    ? "border-amber-700 text-amber-400"
                    : "border-zinc-700 text-zinc-400"
            }`}
          >
            {sim.liveStatus === "frozen"
              ? "LIVE FROZEN"
              : sim.liveStatus === "stale"
                ? "LIVE STALE"
                : sim.liveStatus === "connecting"
                  ? "LIVE …"
                  : sim.liveStatus === "error"
                    ? "LIVE ERR"
                    : "LIVE"}
          </Badge>
        ) : null}
        {sim.state.flight ? (
          <span className="font-mono text-[10px] uppercase tracking-wide text-amber-400">
            {sim.state.flight.action} ack @ {fmtMs(sim.state.flight.ackT)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="xs"
          variant="outline"
          onClick={sim.start}
          disabled={sim.playing || sim.state.ended}
        >
          Start
        </Button>
        <Button size="xs" variant="outline" onClick={sim.pause} disabled={!sim.playing}>
          Pause
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={sim.stepOnce}
          disabled={sim.state.ended || sim.playing}
        >
          Step event
        </Button>
        <Button size="xs" variant="ghost" onClick={sim.reset}>
          Reset
        </Button>
      </div>
    </header>
  );
}
