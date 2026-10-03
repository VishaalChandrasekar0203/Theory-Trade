# How to use Theory Trade

Theory Trade is a **local ops console** for one high-frequency decision: whether to **join, wait in, cancel, reduce, or cross** a child limit order at the **touch** of a single-name book.

It is **not** a live trading system. It does not send orders to Coinbase or any venue. The matching engine is a seeded discrete-event simulator. Public market data, when enabled, only **calibrates the model inputs**.

Read this file to operate the console. The [README](README.md) is the math and model card.

## What this is for

In a price-time (FIFO) book, your order is not “in the market” in a useful sense until **every share ahead of you** at that price is filled or canceled, **and** marketable flow still wants your price before:

- the opposite queue drains (the touch **vanishes** / price jumps), or
- your cancel is acknowledged after latency \(L\).

That is the problem HFT market-makers and smart-order routers solve tick-by-tick:

- **Queue position is an asset.** The same size at the same price is a different bet at \(n = 20\) vs \(n = 20{,}000\).
- **Fills are adversely selected.** Flow that reaches the front is more informed than average.
- **A cancel sent at time \(t\) is not effective until \(t + L\).** You can still get filled (toxic fill) while the cancel is in flight.

Use the console to **see that trade-off numerically**, replay it from a seed, and watch the recommended action flip when you change \(n_0\), \(L\), or \(\sigma\).

## Requirements

- **Node.js 22 or newer** (the live Coinbase adapter uses the global `WebSocket` API)
- npm (comes with Node)

```bash
cd Theory-Trade   # or queue-theory, if that is the local folder
npm install
npm test
npm run dev
```

Open **http://127.0.0.1:4731** (not 3000).

If you see `EADDRINUSE: address already in use 127.0.0.1:4731`, the app is **already running**. Do not start a second `npm run dev`. Open the URL. To restart from your own terminal:

```bash
kill $(lsof -t -iTCP:4731 -sTCP:LISTEN)
npm run dev
```

## Tour of the console

```
┌ Status strip: product · time · seed · goal · IDLE/RUNNING · LIVE badge · Start/Pause/Step/Reset
├ Controls (left)     Book (center)                         Directive (right)
│  Coinbase ON/OFF    Bid / ask queue bars                  V(a) for Place/Cancel/Reprice/Reduce/Wait
│  BTC-USD / ETH-USD  Tagged slot + latency pipeline        Equation explanation
│  Goal               Inventory strip                       Submit <action>
│  Buy / Sell
│  Sliders (n, μ, L, …)
│  Seed
└ Metrics bar + event tape
```

### 1. Pick a goal

| Goal | What “good” means |
| --- | --- |
| **Maximize fills** | Stay in the queue unless \(n\) is hopeless vs the horizon |
| **Minimize cost** | Prefer cancel when a fill looks toxic; take only if spread + adverse selection favors it |
| **Control inventory** | Penalize fills that push signed inventory away from \(I^\star\) (default 0) |

The simulator does not change. Only the weights on fill probability, cost, and inventory penalty change. The highlighted row on the right is \(\arg\max V(a)\).

### 2. Pick a side

**Buy** joins the bid. **Sell** joins the ask. Same model, sign flip on inventory.

### 3. Set the world (or let Coinbase do it)

The sliders are the closed-form inputs:

| Slider | Meaning |
| --- | --- |
| Size \(r_0\) | Tagged child size in lots |
| Ahead \(n_0\) | Shares **strictly in front** at a fresh join |
| Opp \(q\) | Opposite touch size (vanish hazard) |
| Latency \(L\) | Deterministic ack delay (ms) |
| \(\lambda\) | Limit arrivals **behind** you (cannot overtake) |
| \(\theta\) | Cancel rate **per share** |
| \(\mu\) / \(\mu_{\text{opp}}\) | Marketable hit rate on our / opposite touch |
| \(\sigma\) | Volatility used in adverse selection and vanish |
| \(\phi\) | Inventory penalty |

**Coinbase ON** (optional): the server subscribes to Coinbase Exchange public `ticker` + `matches` for BTC-USD or ETH-USD. **No API key.** A 10-second window estimates \(\lambda, \mu, \theta, \sigma, n\) and writes those sliders. \(n\) is **touch size** (join-the-back), not true FIFO rank. \(L\), size, \(\phi\), and seed stay yours.

The header badge:

- **LIVE …** connecting
- **LIVE** estimates flowing into the sliders
- **LIVE FROZEN** you hit Start; the DES path is now a constant-parameter replay
- **LIVE STALE** / **LIVE ERR** the public websocket lagged or dropped

This is **not** colocation and **not** your live order.

### 4. Start the episode

**Start** runs one seeded discrete-event path. Simulated time \(t\) is milliseconds; the UI plays events on a wall-clock timer so you can watch them.

- **Pause** / **Step event** / **Reset** — Reset rebuilds from the current sliders and seed.
- Changing a slider **resets the path** so seed replay stays honest.
- **Follow recommendation ON** submits the argmax action whenever you are not in flight.

Default seed is **42**. Start → Reset → Start again. The event tape matches. That is the portfolio claim.

### 5. Act (or wait)

| Action | What the engine does |
| --- | --- |
| **Place** | Join the **back** of the chosen touch after \(L\). If the touch vanished in flight, the join **misses**. |
| **Cancel** | Cancel is effective only after \(L\). Hits can still fill you until ACK. |
| **Reprice** | Cancel + cross one tick (take the far side). |
| **Reduce size** | Replace remaining size with \(\lfloor r / 2 \rfloor\), same latency race. |
| **Wait** | Do nothing. Queues and the vanish clock still run. |

A second outbound action while one is in flight is **rejected** (ops warning). You cannot place two tagged orders.

The directive panel always shows scores for all five. You may click a worse action on purpose; the sim is not a locked autopilot unless Follow is on.

## What is happening under the hood

Two layers, on purpose:

| Layer | Job | Source of truth for |
| --- | --- | --- |
| Closed form (`lib/sim/formulas.ts`, `policy.ts`) | Instant \(P(\text{fill})\), wait, cost, adverse selection, \(V(a)\) | **Recommended action** and on-screen equations |
| Discrete-event sim (`lib/sim/engine.ts`) | One mulberry32 path: hits, cancels ahead/behind, acks, vanish | **Event tape**, inventory, realized shortfall |

They are allowed to disagree. The recommendation does **not** Monte Carlo the tape. The tape is one concrete story for the same parameters.

Event clocks (exponential except ACK and episode end): `HIT_OURS`, `HIT_OPP`, `CXL_AHEAD`, `CXL_BEHIND`, `ARRIVE_BEHIND`, `ARRIVE_OPP`, plus `ACK` at submit \(+ L\) and `EPISODE_END` at horizon \(T = 250\,\text{ms}\).

Your order does **not** randomly self-cancel. If the opposite queue hits zero, the tagged remainder **vanishes** (no leftover fill at the old price).

There is **no LLM**. The explanation paragraph is a template filled from the same numbers as \(V(a)\).

## A useful first session (five minutes)

1. Leave Coinbase **OFF**. Goal: **Minimize cost**. Seed **42**. Start.
2. Read the directive: which term beat the runner-up?
3. Raise **Ahead \(n_0\)** a lot, Start again. The recommendation should get more willing to wait or abandon a hopeless queue.
4. Drop **Latency \(L\)** toward 0, then raise it. Cancel races change because the cancel is not instantaneous.
5. Flip **Coinbase ON**, wait for **LIVE**, watch \(n_0\) and \(\mu\) move, then **Start**. Badge becomes **LIVE FROZEN**. The tape is now a model path calibrated to that window, not a live matching engine.

## What this is not

- Not a broker, OMS, or Coinbase trading bot
- Not L3 / MBO queue position (public L1 cannot see who is ahead of you)
- Not colocation latency (public websocket lag is tens to hundreds of milliseconds)
- Not a full book (one tick, one tagged order, no hidden liquidity, no multi-venue routing)

If you want the equations in full, they live in the README and in `lib/sim/formulas.ts`. Those two should match.
