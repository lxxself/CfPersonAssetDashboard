import type { AssetHistory, AssetLocation, ExchangeRates, TrendPoint } from "@asset-dashboard/domain";

export type Bindings = {
  DB: D1Database;
  ASSET_KV: KVNamespace;
  EXCHANGE_RATE_API_URL?: string;
  DASHBOARD_PASSWORD?: string;
};

export type AssetLocationRow = {
  id: string;
  name: string;
  currency: string;
  initial_amount: number;
  current_amount: number;
  tags: string;
  created_at: string;
  updated_at: string;
};

export type AssetHistoryRow = {
  id: string;
  location_id: string;
  change_amount: number;
  final_amount: number;
  snapshot_time: string;
  note: string | null;
};

export type { AssetHistory, AssetLocation, ExchangeRates, TrendPoint };
export type ExchangeRatesCache = ExchangeRates;
