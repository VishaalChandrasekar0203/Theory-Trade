"use client";

import { BookPanel } from "@/components/book-panel";
import { ControlsPanel } from "@/components/controls-panel";
import { DirectivePanel } from "@/components/directive-panel";
import { EventTape } from "@/components/event-tape";
import { MetricsBar } from "@/components/metrics-bar";
import { StatusStrip } from "@/components/status-strip";
import { useSimulation } from "@/hooks/use-simulation";

export function Console() {
  const sim = useSimulation();
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
      <StatusStrip sim={sim} />
      {sim.warning ? (
        <div className="border-b border-amber-900/80 bg-amber-950/40 px-3 py-1.5 font-mono text-[11px] text-amber-400">
          {sim.warning}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <ControlsPanel sim={sim} />
        <BookPanel sim={sim} />
        <DirectivePanel sim={sim} />
      </div>
      <div className="flex min-h-[168px] flex-col border-t border-zinc-800 lg:h-52 lg:flex-row">
        <MetricsBar sim={sim} />
        <EventTape sim={sim} />
      </div>
    </div>
  );
}
