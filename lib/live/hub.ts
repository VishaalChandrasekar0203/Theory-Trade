/**
 * One Coinbase Exchange public websocket per product.
 * Public L1 (ticker) + matches — no API key.
 */

import { estimateFromWindow } from "./estimate";
import { ewma } from "./ewma";
import {
  LIVE_LOT_BTC,
  LIVE_WINDOW_SEC,
  type BookSnapshot,
  type LiveEstimate,
  type LiveFrame,
  type Print,
} from "./types";

const COINBASE_WS = "wss://ws-feed.exchange.coinbase.com";
const EMIT_MS = 500;
const TICK: Record<string, number> = {
  "BTC-USD": 0.01,
  "ETH-USD": 0.01,
};

type Listener = (frame: LiveFrame) => void;

interface ProductFeed {
  product: string;
  ws: WebSocket | null;
  snapshots: BookSnapshot[];
  prints: Print[];
  listeners: Set<Listener>;
  smoothed: LiveEstimate | null;
  lastVendorTs: number;
  timer: ReturnType<typeof setInterval> | null;
  reconnect: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
}

const feeds = new Map<string, ProductFeed>();

function toLots(size: number): number {
  return Math.max(0, size / LIVE_LOT_BTC);
}

function parseTime(raw: unknown): number {
  if (typeof raw !== "string") return Date.now();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.now();
}

function prune(feed: ProductFeed, now: number): void {
  const cut = now - LIVE_WINDOW_SEC * 1000 * 2;
  feed.snapshots = feed.snapshots.filter((s) => s.tMs >= cut);
  feed.prints = feed.prints.filter((p) => p.tMs >= cut);
}

function emit(feed: ProductFeed): void {
  const now = Date.now();
  prune(feed, now);
  const last = feed.snapshots[feed.snapshots.length - 1];
  const lagMs = last
    ? Math.max(0, now - last.tMs)
    : feed.lastVendorTs
      ? Math.max(0, now - feed.lastVendorTs)
      : 0;
  const stale = Boolean(last) && now - last.tMs > LIVE_WINDOW_SEC * 2000;
  const wsOpen = Boolean(feed.ws && (feed.ws.readyState === 0 || feed.ws.readyState === 1));
  const raw = estimateFromWindow({
    snapshots: feed.snapshots,
    prints: feed.prints,
    windowSec: LIVE_WINDOW_SEC,
    tickSize: TICK[feed.product] ?? 0.01,
  });
  if (raw) {
    const prev = feed.smoothed;
    feed.smoothed = {
      ...raw,
      lambdaBid: ewma(prev?.lambdaBid ?? null, raw.lambdaBid),
      lambdaAsk: ewma(prev?.lambdaAsk ?? null, raw.lambdaAsk),
      muBid: ewma(prev?.muBid ?? null, raw.muBid),
      muAsk: ewma(prev?.muAsk ?? null, raw.muAsk),
      thetaBid: ewma(prev?.thetaBid ?? null, raw.thetaBid),
      thetaAsk: ewma(prev?.thetaAsk ?? null, raw.thetaAsk),
      sigma: ewma(prev?.sigma ?? null, raw.sigma),
    };
  }
  const frame: LiveFrame = {
    ok: Boolean(feed.smoothed),
    stale,
    product: feed.product,
    venue: "coinbase",
    lagMs,
    vendorTs: last?.tMs ?? 0,
    estimate: feed.smoothed ?? undefined,
    error: wsOpen || feed.smoothed
      ? undefined
      : "Live feed disconnected — retrying.",
  };
  for (const listener of feed.listeners) listener(frame);
}

function onMessage(feed: ProductFeed, data: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }
  const type = msg.type;
  if (type === "ticker") {
    const bid = Number(msg.best_bid);
    const ask = Number(msg.best_ask);
    const bidSize = Number(msg.best_bid_size);
    const askSize = Number(msg.best_ask_size);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= 0) return;
    if (!Number.isFinite(bidSize) || !Number.isFinite(askSize)) return;
    const tMs = parseTime(msg.time);
    feed.lastVendorTs = tMs;
    feed.snapshots.push({
      tMs,
      bidLots: toLots(bidSize),
      askLots: toLots(askSize),
      bid,
      ask,
      mid: (bid + ask) / 2,
    });
    return;
  }
  if (type === "match" || type === "last_match") {
    const size = Number(msg.size);
    const price = Number(msg.price);
    if (!Number.isFinite(size) || size <= 0) return;
    const maker = msg.side === "buy" ? "buy" : "sell";
    const aggressor = maker === "buy" ? "sell" : "buy";
    const tMs = parseTime(msg.time);
    feed.lastVendorTs = tMs;
    feed.prints.push({
      tMs,
      lots: toLots(size),
      price: Number.isFinite(price) ? price : 0,
      aggressor,
    });
  }
}

function connect(feed: ProductFeed): void {
  if (feed.ws && (feed.ws.readyState === 0 || feed.ws.readyState === 1)) return;
  try {
    const ws = new WebSocket(COINBASE_WS);
    feed.ws = ws;
    ws.addEventListener("open", () => {
      feed.backoffMs = 1000;
      ws.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: [feed.product],
          channels: ["ticker", "matches"],
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      onMessage(feed, String(ev.data));
    });
    ws.addEventListener("close", () => {
      feed.ws = null;
      scheduleReconnect(feed);
    });
    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    feed.ws = null;
    scheduleReconnect(feed);
    void err;
  }
}

function scheduleReconnect(feed: ProductFeed): void {
  if (feed.listeners.size === 0) return;
  if (feed.reconnect) return;
  const wait = feed.backoffMs;
  feed.backoffMs = Math.min(feed.backoffMs * 2, 15_000);
  feed.reconnect = setTimeout(() => {
    feed.reconnect = null;
    connect(feed);
  }, wait);
}

function ensureFeed(product: string): ProductFeed {
  const existing = feeds.get(product);
  if (existing) return existing;
  const feed: ProductFeed = {
    product,
    ws: null,
    snapshots: [],
    prints: [],
    listeners: new Set(),
    smoothed: null,
    lastVendorTs: 0,
    timer: null,
    reconnect: null,
    backoffMs: 1000,
  };
  feeds.set(product, feed);
  return feed;
}

export function subscribeLive(product: string, listener: Listener): () => void {
  const feed = ensureFeed(product);
  feed.listeners.add(listener);
  if (!feed.timer) {
    feed.timer = setInterval(() => emit(feed), EMIT_MS);
  }
  connect(feed);
  emit(feed);
  return () => {
    feed.listeners.delete(listener);
    if (feed.listeners.size > 0) return;
    if (feed.timer) {
      clearInterval(feed.timer);
      feed.timer = null;
    }
    if (feed.reconnect) {
      clearTimeout(feed.reconnect);
      feed.reconnect = null;
    }
    if (feed.ws) {
      try {
        feed.ws.close();
      } catch {
        /* ignore */
      }
      feed.ws = null;
    }
  };
}
