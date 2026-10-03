"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mono, SectionLabel } from "@/components/ops";
import type { SimulationController } from "@/hooks/use-simulation";
import { fmtMs } from "@/lib/format";
import type { EventKind } from "@/lib/sim";

const KIND_TONE: Partial<Record<EventKind, string>> = {
  OUR_FILL: "text-emerald-400",
  TOXIC_FILL: "text-amber-400",
  QUEUE_VANISH: "text-rose-400",
  ACK: "text-cyan-400",
  ACTION_REJECTED: "text-amber-400",
  PLACE_MISSED: "text-amber-400",
  ALREADY_FILLED: "text-zinc-400",
  EPISODE_END: "text-zinc-300",
};

export function EventTape({ sim }: { sim: SimulationController }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [sim.events.length]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-2">
      <div className="flex items-baseline gap-2">
        <SectionLabel>Event tape</SectionLabel>
        {sim.liveStatus === "frozen" ? (
          <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">
            Model path · calibrated
          </span>
        ) : null}
      </div>
      <ScrollArea className="mt-1 h-40 lg:h-full">
        <ol className="flex flex-col gap-0.5 font-mono text-[11px]">
          {!sim.started && sim.events.length === 0 ? (
            <li className="text-zinc-600">Awaiting START.</li>
          ) : null}
          {sim.events.map((event, i) => (
            <li key={`${event.t}-${event.kind}-${i}`} className="flex gap-2">
              <Mono className="shrink-0 text-zinc-600">{fmtMs(event.t)}</Mono>
              <span className={`shrink-0 uppercase ${KIND_TONE[event.kind] ?? "text-zinc-400"}`}>
                {event.kind}
              </span>
              <span className="min-w-0 truncate text-zinc-500">{event.note}</span>
            </li>
          ))}
          <div ref={endRef} />
        </ol>
      </ScrollArea>
    </div>
  );
}
