/** Live L1/print window. Units: integer lots, milliseconds. No network. */

export interface BookSnapshot {
  tMs: number;
  bidLots: number;
  askLots: number;
  bid: number;
  ask: number;
  mid: number;
}

export interface Print {
  tMs: number;
  lots: number;
  price: number;
  /** Taker side: sell hits the bid, buy hits the ask. */
  aggressor: "buy" | "sell";
}

export interface MarketWindow {
  snapshots: BookSnapshot[];
  prints: Print[];
  windowSec: number;
  /** Quote increment in price units (BTC-USD = 0.01). */
  tickSize: number;
}

export interface LiveEstimate {
  bidLots: number;
  askLots: number;
  lambdaBid: number;
  lambdaAsk: number;
  muBid: number;
  muAsk: number;
  thetaBid: number;
  thetaAsk: number;
  sigma: number;
  spreadTicks: number;
  mid: number;
  windowSec: number;
  thetaLowConfidence: boolean;
  sampleSnapshots: number;
  samplePrints: number;
}

export interface LiveFrame {
  ok: boolean;
  stale: boolean;
  product: string;
  venue: "coinbase";
  lagMs: number;
  vendorTs: number;
  error?: string;
  estimate?: LiveEstimate;
}

export const LIVE_WINDOW_SEC = 10;
export const LIVE_LOT_BTC = 0.001;
export const LIVE_PRODUCTS = ["BTC-USD", "ETH-USD"] as const;
export type LiveProduct = (typeof LIVE_PRODUCTS)[number];
