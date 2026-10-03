"use client";

import { CHI, CHI_TAKE, KAPPA_SIGMA, isResting } from "@/lib/sim";
import type { SimulationController } from "@/hooks/use-simulation";
import { fmtMs, fmtProb } from "@/lib/format";

export function ModelCard({ sim }: { sim: SimulationController }) {
  const { thermo, state, params, rec } = sim;
  const n = isResting(state) ? state.n : state.ourQueue;
  return (
    <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-zinc-400">
      <p className="text-zinc-200">
        Competing M/M/1 touch queues with share-proportional reneging, a FIFO tagged
        customer, and a deterministic latency channel.
      </p>
      <p>
        Not a bank teller. Tagged FIFO in competing LOB queues with reneging and delay.
        Cont–Stoikov–Talreja skeleton, two touches; first queue to zero moves the price.
      </p>
      <p className="font-mono text-[10px] text-zinc-500">
        T_front = {n <= 0 ? "0" : "θ⁻¹ ln(1 + θ n / μ)"} = {fmtMs(thermo.tFrontSec * 1000)}
        <br />
        T_fill ≈ T_front + r/μ = {fmtMs(thermo.tFillSec * 1000)}
        <br />
        ν = μ_opp / q_opp + κ_σ σ = {thermo.nu.toFixed(3)} /s (κ_σ={KAPPA_SIGMA})
        <br />
        P(fill) = exp(−ν T_fill) = {fmtProb(thermo.pFill)}
        <br />
        c_fill = −s/2 + χ_eff σ · χ={CHI}, χ_take={CHI_TAKE}
        <br />
        V(a) = w_P P̂ − w_C C − w_I ΔΠ · a* = {rec.best.action}
      </p>
      <p>
        State: t={state.t.toFixed(3)} ms, our={state.ourQueue}, opp={state.oppQueue}, n={state.n},
        r={state.r}, b={state.b}, I={state.inventory}, side={state.side}, gen={state.bookGeneration}.
      </p>
      <p>
        Recommendations use the closed form. The tape is one seeded DES path. No live model
        chooses the action. λ={params.lambda}/s, μ={params.mu}/s, θ={params.theta}/s/share, L=
        {params.latencyMs} ms.
      </p>
      {sim.liveEnabled ? (
        <p>
          Live calibration: Coinbase Exchange public ticker + matches ({sim.liveProduct}), 10s
          window. n is estimated from touch size, not order priority. θ is weakly identified.
          {sim.liveFrame?.estimate?.thetaLowConfidence ? " θ badge: low confidence." : ""}{" "}
          Lag {Math.round(sim.liveFrame?.lagMs ?? 0)} ms. Status {sim.liveStatus}. Estimates
          freeze at Start.
        </p>
      ) : null}
    </div>
  );
}
