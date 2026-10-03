"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Mono, SectionLabel } from "@/components/ops";
import type { SimulationController } from "@/hooks/use-simulation";
import { GOAL_LABELS, type GoalId, type SimParams } from "@/lib/sim";

interface SliderSpec {
  key: keyof SimParams;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: "r0", label: "Size r₀", min: 1, max: 500, step: 1, format: (v) => `${v}` },
  { key: "n0", label: "Ahead n₀", min: 0, max: 2000, step: 1, format: (v) => `${v}` },
  { key: "qOpp0", label: "Opp q", min: 1, max: 2000, step: 1, format: (v) => `${v}` },
  { key: "latencyMs", label: "Latency L", min: 0, max: 50, step: 0.5, format: (v) => `${v} ms` },
  { key: "lambda", label: "λ behind", min: 0, max: 10000, step: 50, format: (v) => `${v}/s` },
  { key: "theta", label: "θ /share", min: 0, max: 40, step: 0.5, format: (v) => `${v}/s` },
  { key: "mu", label: "μ hit", min: 1, max: 20000, step: 50, format: (v) => `${v}/s` },
  { key: "muOpp", label: "μ opp", min: 0, max: 20000, step: 50, format: (v) => `${v}/s` },
  { key: "sigma", label: "σ vol", min: 0, max: 3, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "phi", label: "φ penalty", min: 0, max: 0.02, step: 0.0005, format: (v) => v.toFixed(4) },
];

function ParamSlider({
  spec,
  value,
  onChange,
}: {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr_64px] items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{spec.label}</span>
      <Slider
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        onValueChange={(v) => {
          const next = Array.isArray(v) ? v[0] : v;
          if (typeof next === "number" && Number.isFinite(next)) onChange(next);
        }}
      />
      <Mono className="text-right text-[11px] text-zinc-300">{spec.format(value)}</Mono>
    </div>
  );
}

export function ControlsPanel({ sim }: { sim: SimulationController }) {
  const p = sim.params;
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-zinc-800 p-3 lg:border-r">
      <SectionLabel>Controls</SectionLabel>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Goal</span>
          <Select
            value={sim.goal}
            items={GOAL_LABELS}
            onValueChange={(value) => {
              if (value) sim.setGoal(value as GoalId);
            }}
          >
            <SelectTrigger size="sm" className="w-full rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GOAL_LABELS) as GoalId[]).map((id) => (
                <SelectItem key={id} value={id}>
                  {GOAL_LABELS[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Side</span>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="Join side">
            <Button
              size="sm"
              type="button"
              aria-pressed={p.joinSide === "bid"}
              variant={p.joinSide === "bid" ? "default" : "outline"}
              className={`rounded-sm ${
                p.joinSide === "bid"
                  ? "bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
                  : ""
              }`}
              onClick={() => {
                if (p.joinSide !== "bid") sim.updateParams({ joinSide: "bid" });
              }}
            >
              Buy
            </Button>
            <Button
              size="sm"
              type="button"
              aria-pressed={p.joinSide === "ask"}
              variant={p.joinSide === "ask" ? "default" : "outline"}
              className={`rounded-sm ${
                p.joinSide === "ask"
                  ? "bg-amber-400 text-zinc-950 hover:bg-amber-300"
                  : ""
              }`}
              onClick={() => {
                if (p.joinSide !== "ask") sim.updateParams({ joinSide: "ask" });
              }}
            >
              Sell
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {SLIDERS.map((spec) => (
          <ParamSlider
            key={spec.key}
            spec={spec}
            value={p[spec.key] as number}
            onChange={(v) => sim.updateParams({ [spec.key]: v })}
          />
        ))}
      </div>

      <Separator />

      <div className="grid grid-cols-[72px_1fr] items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Seed</span>
        <Input
          className="h-7 rounded-sm font-mono text-xs"
          value={p.seed}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 0) sim.updateParams({ seed: n });
          }}
        />
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-600">
        Slider edits reset the live path. Closed-form scores update immediately; the tape
        always belongs to one seed.
      </p>

      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant={sim.followRec ? "default" : "outline"}
          className="justify-start rounded-sm"
          onClick={() => sim.setFollowRec(!sim.followRec)}
        >
          Follow recommendation {sim.followRec ? "ON" : "OFF"}
        </Button>
        <Button
          size="sm"
          variant={p.mustExecute ? "default" : "outline"}
          className="justify-start rounded-sm"
          onClick={() => sim.updateParams({ mustExecute: !p.mustExecute })}
        >
          Must-execute unfill cost {p.mustExecute ? "ON" : "OFF"}
        </Button>
      </div>
    </aside>
  );
}
