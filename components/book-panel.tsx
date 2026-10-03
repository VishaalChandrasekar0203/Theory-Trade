"use client";

import { Mono, SectionLabel } from "@/components/ops";
import type { SimulationController } from "@/hooks/use-simulation";
import { isResting } from "@/lib/sim";
import { fmtInt, fmtMs, fmtSignedInt } from "@/lib/format";

function QueueBar({
  label,
  total,
  n,
  r,
  b,
  tagged,
  scale,
}: {
  label: string;
  total: number;
  n: number;
  r: number;
  b: number;
  tagged: boolean;
  scale: number;
}) {
  const width = scale > 0 ? Math.max(2, (total / scale) * 100) : 0;
  const nPct = total > 0 && tagged ? (n / total) * 100 : 0;
  const rPct = total > 0 && tagged ? (r / total) * 100 : 0;
  const bPct = total > 0 && tagged ? (b / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
        <Mono className="text-[11px]">{fmtInt(total)}</Mono>
      </div>
      <div className="h-6 w-full bg-zinc-900 ring-1 ring-zinc-800">
        <div
          className="flex h-full overflow-hidden transition-[width] duration-150"
          style={{ width: `${Math.min(100, width)}%` }}
        >
          {tagged ? (
            <>
              <div className="h-full bg-cyan-900/80" style={{ width: `${nPct}%` }} title={`ahead ${n}`} />
              <div
                className="h-full bg-cyan-400"
                style={{ width: `${Math.max(rPct, r > 0 ? 1.5 : 0)}%` }}
                title={`tagged ${r}`}
              />
              <div className="h-full bg-zinc-600" style={{ width: `${bPct}%` }} title={`behind ${b}`} />
            </>
          ) : (
            <div className="h-full w-full bg-zinc-700" />
          )}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: { t: number; inventory: number }[] }) {
  if (points.length < 2) {
    return <div className="h-12 bg-zinc-950 ring-1 ring-zinc-800" />;
  }
  const w = 240;
  const h = 48;
  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t || 1;
  const vals = points.map((p) => p.inventory);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const d = points
    .map((p, i) => {
      const x = ((p.t - t0) / (t1 - t0 || 1)) * w;
      const y = h - ((p.inventory - lo) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const zeroY = h - ((0 - lo) / span) * (h - 4) - 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full bg-zinc-950 ring-1 ring-zinc-800">
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#3f3f46" strokeWidth="1" />
      <path d={d} fill="none" stroke="#22d3ee" strokeWidth="1.25" />
    </svg>
  );
}

export function BookPanel({ sim }: { sim: SimulationController }) {
  const { state, params } = sim;
  const resting = isResting(state);
  const bidTagged = resting && params.joinSide === "bid";
  const askTagged = resting && params.joinSide === "ask";
  const bidSize = params.joinSide === "bid" ? state.ourQueue : state.oppQueue;
  const askSize = params.joinSide === "ask" ? state.ourQueue : state.oppQueue;
  const scale = Math.max(bidSize, askSize, 1);
  const flight = state.flight;
  const progress =
    flight && flight.ackT > flight.submitT
      ? Math.min(1, Math.max(0, (state.t - flight.submitT) / (flight.ackT - flight.submitT)))
      : flight
        ? 1
        : 0;
  const imbalanceDen = state.ourQueue + state.oppQueue;
  const imbalance = imbalanceDen > 0 ? (state.ourQueue - state.oppQueue) / imbalanceDen : 0;

  return (
    <section className="flex min-h-0 flex-col gap-3 p-3">
      <SectionLabel>Competing queues</SectionLabel>
      <QueueBar
        label="Bid"
        total={bidSize}
        n={bidTagged ? state.n : 0}
        r={bidTagged ? state.r : 0}
        b={bidTagged ? state.b : 0}
        tagged={bidTagged}
        scale={scale}
      />
      <QueueBar
        label="Ask"
        total={askSize}
        n={askTagged ? state.n : 0}
        r={askTagged ? state.r : 0}
        b={askTagged ? state.b : 0}
        tagged={askTagged}
        scale={scale}
      />
      <div className="font-mono text-[11px] text-zinc-500">
        tagged{" "}
        {resting ? (
          <>
            n=<Mono tone="cyan">{fmtInt(state.n)}</Mono>
            <span className="text-zinc-700"> · </span>
            r=<Mono tone="cyan">{fmtInt(state.r)}</Mono>
            <span className="text-zinc-700"> · </span>
            b=<Mono>{fmtInt(state.b)}</Mono>
          </>
        ) : (
          <span>not in book</span>
        )}
      </div>

      <SectionLabel>Latency pipeline</SectionLabel>
      <div className="h-2 w-full bg-zinc-900 ring-1 ring-zinc-800">
        <div
          className={`h-full transition-[width] duration-100 ${flight ? "bg-amber-400" : "bg-transparent"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="text-[11px] text-zinc-500">
        {flight ? (
          <>
            {flight.action} in flight · ack in{" "}
            <Mono tone="amber">{fmtMs(Math.max(0, flight.ackT - state.t))}</Mono>
          </>
        ) : (
          "No outbound action in flight"
        )}
      </div>

      <SectionLabel>Inventory</SectionLabel>
      <Sparkline points={sim.inventoryHistory} />
      <div className="flex flex-wrap gap-4 text-[11px] text-zinc-500">
        <span>
          I=<Mono tone={Math.abs(state.inventory) > 50 ? "red" : "cyan"}>{fmtSignedInt(state.inventory)}</Mono>
        </span>
        <span>
          I*=<Mono>{fmtSignedInt(params.inventoryTarget)}</Mono>
        </span>
        <span>
          mid=<Mono>{state.mid.toFixed(3)}</Mono>
        </span>
        <span>
          s=<Mono>{params.spread.toFixed(2)}</Mono>
        </span>
        <span>
          imb=<Mono>{imbalance.toFixed(3)}</Mono>
        </span>
      </div>
    </section>
  );
}
