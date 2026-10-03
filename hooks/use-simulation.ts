"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PARAMS,
  Simulation,
  cloneParams,
  explain,
  isResting,
  recommend,
  thermometer,
  type GoalId,
  type SimParams,
  type TraderAction,
} from "@/lib/sim";
import {
  LIVE_PRODUCTS,
  estimateToParams,
  type LiveFrame,
  type LiveProduct,
} from "@/lib/live";

const PLAYBACK_MS = 85;

export type LiveStatus = "off" | "connecting" | "live" | "stale" | "frozen" | "error";

export function useSimulation() {
  const [params, setParams] = useState<SimParams>(() => cloneParams(DEFAULT_PARAMS));
  const [goal, setGoal] = useState<GoalId>("minimize_cost");
  const [followRec, setFollowRec] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveProduct, setLiveProduct] = useState<LiveProduct>("BTC-USD");
  const [liveFrame, setLiveFrame] = useState<LiveFrame | null>(null);

  const simRef = useRef(new Simulation(DEFAULT_PARAMS));
  const followRef = useRef(followRec);
  const goalRef = useRef(goal);
  const startedRef = useRef(started);
  const paramsRef = useRef(params);
  const liveFrameRef = useRef(liveFrame);
  const liveEnabledRef = useRef(liveEnabled);
  followRef.current = followRec;
  goalRef.current = goal;
  startedRef.current = started;
  paramsRef.current = params;
  liveFrameRef.current = liveFrame;
  liveEnabledRef.current = liveEnabled;

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const rebuild = useCallback(
    (next: SimParams, silent = false) => {
      simRef.current = new Simulation(next);
      setStarted(false);
      setPlaying(false);
      if (!silent) {
        setWarning("Parameter change resets the path so seed replay stays honest.");
      }
      bump();
    },
    [bump],
  );

  const updateParams = useCallback(
    (patch: Partial<SimParams>) => {
      setParams((prev) => {
        let next = { ...prev, ...patch };
        const frame = liveFrameRef.current;
        if (
          patch.joinSide &&
          liveEnabledRef.current &&
          !startedRef.current &&
          frame?.estimate
        ) {
          next = { ...next, ...estimateToParams(frame.estimate, patch.joinSide) };
        }
        rebuild(next);
        return next;
      });
    },
    [rebuild],
  );

  const applyLivePatch = useCallback(
    (patch: Partial<SimParams>) => {
      if (startedRef.current) return;
      setParams((prev) => {
        const next = { ...prev, ...patch };
        simRef.current = new Simulation(next);
        bump();
        return next;
      });
    },
    [bump],
  );

  const followIfNeeded = useCallback(() => {
    if (!followRef.current) return;
    const sim = simRef.current;
    if (sim.state.ended || sim.state.flight) return;
    const rec = recommend(sim.state, sim.params, goalRef.current);
    if (rec.best.action !== "wait") {
      const result = sim.submit(rec.best.action);
      if (!result.ok && result.warning) setWarning(result.warning);
    }
  }, []);

  const stepOnce = useCallback(() => {
    const sim = simRef.current;
    if (sim.state.ended) {
      setPlaying(false);
      bump();
      return;
    }
    sim.step();
    if (sim.state.ended) setPlaying(false);
    followIfNeeded();
    bump();
  }, [bump, followIfNeeded]);

  const start = useCallback(() => {
    setStarted(true);
    setPlaying(true);
    setWarning(null);
    followIfNeeded();
    bump();
  }, [bump, followIfNeeded]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    simRef.current.reset(params);
    setStarted(false);
    setPlaying(false);
    setWarning(null);
    bump();
  }, [bump, params]);

  const submit = useCallback(
    (action: TraderAction) => {
      if (!started) {
        setStarted(true);
      }
      const result = simRef.current.submit(action);
      if (!result.ok && result.warning) {
        setWarning(result.warning);
      } else {
        setWarning(null);
      }
      bump();
    },
    [bump, started],
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(stepOnce, PLAYBACK_MS);
    return () => window.clearInterval(id);
  }, [playing, stepOnce]);

  useEffect(() => {
    if (!liveEnabled) {
      setLiveFrame(null);
      return;
    }
    const source = new EventSource(`/api/market?product=${encodeURIComponent(liveProduct)}`);
    source.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as LiveFrame;
        setLiveFrame(frame);
        if (startedRef.current) return;
        if (frame.ok && frame.estimate) {
          applyLivePatch(estimateToParams(frame.estimate, paramsRef.current.joinSide));
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    source.onerror = () => {
      setLiveFrame((prev) => ({
        ok: false,
        stale: true,
        product: liveProduct,
        venue: "coinbase",
        lagMs: prev?.lagMs ?? 0,
        vendorTs: prev?.vendorTs ?? 0,
        error: "Live feed disconnected — retrying.",
      }));
    };
    return () => source.close();
  }, [liveEnabled, liveProduct, applyLivePatch]);

  const sim = simRef.current;
  const state = sim.state;
  const events = sim.events;
  const inventoryHistory = sim.inventoryHistory;
  const rec = useMemo(
    () => recommend(state, params, goal),
    [state, params, goal, version],
  );
  const thermo = useMemo(
    () => thermometer(state, params),
    [state, params, version],
  );
  const explanation = useMemo(
    () => explain(rec, isResting(state) ? state.n : state.ourQueue, params.latencyMs),
    [rec, state, params],
  );

  let status: "idle" | "running" | "paused" | "ended" | "inflight" = "idle";
  if (state.ended) status = "ended";
  else if (state.flight) status = "inflight";
  else if (playing) status = "running";
  else if (started) status = "paused";

  let liveStatus: LiveStatus = "off";
  if (liveEnabled && started) liveStatus = "frozen";
  else if (liveEnabled && liveFrame?.error && !liveFrame.ok) liveStatus = "error";
  else if (liveEnabled && liveFrame?.stale) liveStatus = "stale";
  else if (liveEnabled && liveFrame?.ok) liveStatus = "live";
  else if (liveEnabled) liveStatus = "connecting";

  return {
    params,
    updateParams,
    goal,
    setGoal,
    followRec,
    setFollowRec,
    started,
    playing,
    warning,
    status,
    state,
    events,
    inventoryHistory,
    rec,
    thermo,
    explanation,
    start,
    pause,
    stepOnce,
    reset,
    submit,
    version,
    liveEnabled,
    setLiveEnabled,
    liveProduct,
    setLiveProduct: (product: LiveProduct) => {
      if (LIVE_PRODUCTS.includes(product)) setLiveProduct(product);
    },
    liveFrame,
    liveStatus,
  };
}

export type SimulationController = ReturnType<typeof useSimulation>;
