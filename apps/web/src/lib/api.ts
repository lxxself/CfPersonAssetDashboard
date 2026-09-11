import type {
  AssetHistory,
  AssetLocation,
  BackupFile,
  ExchangeRates,
  Summary,
  TrendPoint
} from "@asset-dashboard/domain";

export type {
  AssetHistory,
  AssetLocation,
  BackupFile,
  ExchangeRates,
  Summary,
  TrendPoint
} from "@asset-dashboard/domain";

const runtimeEnv = (import.meta as ImportMeta & {
  env?: { DEV?: boolean; VITE_API_BASE?: string };
}).env;
const configuredApiBase = runtimeEnv?.VITE_API_BASE?.trim();
const API_BASE = (configuredApiBase || (runtimeEnv?.DEV ? "http://localhost:8787" : "")).replace(/\/+$/, "");
const TOKEN_KEY = "asset-dashboard-token";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`API ${status}: ${path}`);
    this.status = status;
    this.name = "ApiError";
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

export async function getPublicExchangeRates(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/api/exchange-rates`, {
    headers: { "content-type": "application/json" },
    signal
  });
  if (!response.ok) {
    throw new ApiError(response.status, "/api/exchange-rates");
  }
  return response.json() as Promise<ExchangeRates>;
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  exchangeRates: () => getPublicExchangeRates(),
  refreshExchangeRates: () => request<ExchangeRates>("/api/exchange-rates/refresh", { method: "POST" }),
  locations: (params: URLSearchParams) => request<{ items: AssetLocation[] }>(`/api/asset-locations?${params}`),
  history: (id: string) => request<{ items: AssetHistory[] }>(`/api/asset-locations/${id}/history`),
  trend: (id: string, range: string) =>
    request<{ currency: string; trend: TrendPoint[] }>(`/api/asset-locations/${id}/trend?range=${encodeURIComponent(range)}`),
  createLocation: (body: Record<string, unknown>) =>
    request<{ item: AssetLocation }>("/api/asset-locations", { method: "POST", body: JSON.stringify(body) }),
  updateLocation: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetLocation }>(`/api/asset-locations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLocation: (id: string) => request<{ deleted: boolean }>(`/api/asset-locations/${id}`, { method: "DELETE" }),
  createHistory: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetHistory }>(`/api/asset-locations/${id}/history`, { method: "POST", body: JSON.stringify(body) }),
  updateHistory: (id: string, body: Record<string, unknown>) =>
    request<{ item: AssetHistory }>(`/api/asset-history/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteHistory: (id: string) => request<{ deleted: boolean }>(`/api/asset-history/${id}`, { method: "DELETE" }),
  downloadBackup: () => request<BackupFile>("/api/backup"),
  restoreBackup: (backup: BackupFile) =>
    request<{ restored: true; locations: number; history_records: number }>("/api/backup/restore", {
      method: "POST",
      body: JSON.stringify(backup)
    })
};
