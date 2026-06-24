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

const API_BASE = import.meta.env.VITE_API_BASE || "https://personal-asset-dashboard-api.xxl.workers.dev";
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

export const api = {
  summary: () => request<Summary>("/api/summary"),
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
    request<{ deleted: boolean }>(`/api/asset-history/${id}`, { method: "DELETE" })
};

const now = new Date("2026-06-23T10:00:00.000Z").toISOString();
const months = [8, 7, 6, 5, 4, 3, 2, 1, 0].map((offset) => {
  const date = new Date(now);
  date.setMonth(date.getMonth() - offset);
  return date.toISOString();
});

export const mockSummary: Summary = {
  base_currency: "CNY",
  total_cny: 428960.42,
  totals: {
    CNY: 428960.42,
    USD: 59008.19,
    HKD: 461236.64
  },
  currencies: ["CNY", "USD", "HKD"],
  exchange_rates_updated_at: "2026-06-23",
  trend: months.map((date, index) => ({
    date,
    value_cny: [328000, 337500, 352200, 351100, 371800, 382300, 399200, 413700, 428960][index],
    source: index % 2 === 0 ? "event" : "filled",
    record_count: index % 2 === 0 ? 1 : 0
  }))
};

export const mockLocations: AssetLocation[] = [
  {
    id: "loc_1",
    name: "招商银行卡",
    currency: "CNY",
    initial_amount: 120000,
    current_amount: 156430.38,
    tags: ["现金", "银行卡"],
    created_at: months[0],
    updated_at: now
  },
  {
    id: "loc_2",
    name: "美股券商账户",
    currency: "USD",
    initial_amount: 18000,
    current_amount: 24650.72,
    tags: ["证券", "海外"],
    created_at: months[1],
    updated_at: now
  },
  {
    id: "loc_3",
    name: "香港储蓄账户",
    currency: "HKD",
    initial_amount: 88000,
    current_amount: 103200,
    tags: ["现金", "海外"],
    created_at: months[2],
    updated_at: now
  }
];

export const mockHistory: AssetHistory[] = [
  { id: "h1", location_id: "loc_1", change_amount: 8600, final_amount: 156430.38, snapshot_time: months[8], note: "工资结余" },
  { id: "h2", location_id: "loc_1", change_amount: -2300, final_amount: 147830.38, snapshot_time: months[7], note: "旅行支出" },
  { id: "h3", location_id: "loc_1", change_amount: 12000, final_amount: 150130.38, snapshot_time: months[6], note: "年中奖金" }
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
