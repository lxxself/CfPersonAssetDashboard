export type AssetLocation = {
  id: string;
  name: string;
  currency: string;
  initial_amount: number;
  current_amount: number;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type AssetHistory = {
  id: string;
  location_id: string;
  change_amount: number;
  final_amount: number;
  snapshot_time: string;
  note: string | null;
};

export type TrendPoint = {
  date: string;
  value_cny: number;
  source: "event" | "filled";
  record_count: number;
};

export type Summary = {
  base_currency: "CNY";
  total_cny: number;
  totals: Record<string, number>;
  currencies: string[];
  exchange_rates_updated_at: string;
  trend: TrendPoint[];
};

export type ExchangeRates = {
  base: "CNY";
  rates: Record<string, number>;
  updated_at: string;
  source?: string;
  fetched_at?: string;
};

const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
const API_BASE = (configuredApiBase || (import.meta.env.DEV ? "http://localhost:8787" : "")).replace(/\/+$/, "");
const TOKEN_KEY = "asset-dashboard-token";

export class ApiError extends Error {
  constructor(
    public status: number,
    path: string
  ) {
    super(`API ${status}: ${path}`);
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAuthToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    },
    ...init
  });
  if (!response.ok) {
    throw new ApiError(response.status, path);
  }
  return response.json() as Promise<T>;
}

export type BackupFile = {
  format: "cf-personal-asset-dashboard";
  version: 1;
  exported_at: string;
  base_currency: "CNY";
  data: { asset_locations: AssetLocation[]; asset_history: AssetHistory[] };
};

async function downloadBackup() {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/api/backup`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new ApiError(response.status, "/api/backup");
  return response.blob();
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  refreshExchangeRates: () =>
    request<ExchangeRates>("/api/exchange-rates/refresh", { method: "POST" }),
  locations: (params: URLSearchParams) => request<{ items: AssetLocation[] }>(`/api/asset-locations?${params}`),
  history: (id: string) => request<{ items: AssetHistory[] }>(`/api/asset-locations/${id}/history`),
  trend: (id: string, range: string) =>
    request<{ currency: string; trend: TrendPoint[] }>(`/api/asset-locations/${id}/trend?range=${range}`),
  createLocation: (body: Record<string, unknown>) =>
    request<{ item: AssetLocation }>("/api/asset-locations", { method: "POST", body: JSON.stringify(body) }),
  updateLocation: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetLocation }>(`/api/asset-locations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLocation: (id: string) =>
    request<{ deleted: boolean }>(`/api/asset-locations/${id}`, { method: "DELETE" }),
  createHistory: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetHistory }>(`/api/asset-locations/${id}/history`, { method: "POST", body: JSON.stringify(body) }),
  updateHistory: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetHistory }>(`/api/asset-history/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteHistory: (id: string) =>
    request<{ deleted: boolean }>(`/api/asset-history/${id}`, { method: "DELETE" }),
  downloadBackup,
  restoreBackup: (backup: BackupFile) =>
    request<{ restored: true; locations: number; history_records: number }>("/api/backup/restore", {
      method: "POST",
      body: JSON.stringify(backup)
    })
};

const now = new Date("2026-06-23T10:00:00.000Z").toISOString();
const months = [8, 7, 6, 5, 4, 3, 2, 1, 0].map((offset) => {
  const date = new Date(now);
  date.setMonth(date.getMonth() - offset);
  return date.toISOString();
});

export const mockSummary: Summary = {
  base_currency: "CNY",
  total_cny: 42896.42,
  totals: {
    CNY: 42896.42,
    USD: 5900.82,
    HKD: 46123.66
  },
  currencies: ["CNY", "USD", "HKD"],
  exchange_rates_updated_at: "2026-06-23",
  trend: months.map((date, index) => ({
    date,
    value_cny: [32800, 33750, 35220, 35110, 37180, 38230, 39920, 41370, 42896][index],
    source: index % 2 === 0 ? "event" : "filled",
    record_count: index % 2 === 0 ? 1 : 0
  }))
};

export const mockLocations: AssetLocation[] = [
  {
    id: "loc_1",
    name: "示例现金账户",
    currency: "CNY",
    initial_amount: 12000,
    current_amount: 15643.04,
    tags: ["示例", "现金"],
    created_at: months[0],
    updated_at: now
  },
  {
    id: "loc_2",
    name: "示例投资账户",
    currency: "USD",
    initial_amount: 1800,
    current_amount: 2465.07,
    tags: ["示例", "证券"],
    created_at: months[1],
    updated_at: now
  },
  {
    id: "loc_3",
    name: "示例外币账户",
    currency: "HKD",
    initial_amount: 8800,
    current_amount: 10320,
    tags: ["示例", "外币"],
    created_at: months[2],
    updated_at: now
  }
];

export const mockHistory: AssetHistory[] = [
  { id: "h1", location_id: "loc_1", change_amount: 860, final_amount: 15643.04, snapshot_time: months[8], note: "示例收入" },
  { id: "h2", location_id: "loc_1", change_amount: -230, final_amount: 14783.04, snapshot_time: months[7], note: "示例支出" },
  { id: "h3", location_id: "loc_1", change_amount: 1200, final_amount: 15013.04, snapshot_time: months[6], note: "示例入账" }
];

export function mockLocationTrend(location: AssetLocation): TrendPoint[] {
  const start = location.initial_amount;
  const end = location.current_amount;
  return months.map((date, index) => ({
    date,
    value_cny: Math.round((start + ((end - start) * index) / (months.length - 1)) * 100) / 100,
    source: index % 2 === 0 ? "event" : "filled",
    record_count: index % 2 === 0 ? 1 : 0
  }));
}
