import type { AssetLocation, AssetLocationRow, ExchangeRatesCache } from "./types";

export const EXCHANGE_RATES_KEY = "exchange_rates";

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS"
    }
  });
}

export function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function toAssetLocation(row: AssetLocationRow): AssetLocation {
  return {
    ...row,
    currency: row.currency.toUpperCase(),
    tags: parseTags(row.tags)
  };
}

export function normalizeCurrency(value: unknown, fallback = "CNY") {
  if (typeof value !== "string" || !/^[a-zA-Z]{3}$/.test(value)) {
    return fallback;
  }
  return value.toUpperCase();
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).map((tag) => tag.trim()).filter(Boolean);
}

export function toNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function todayIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getFallbackRates(): ExchangeRatesCache {
  return {
    base: "CNY",
    rates: { CNY: 1 },
    updated_at: todayIsoDate(),
    source: "fallback",
    fetched_at: new Date().toISOString()
  };
}

export function toCny(amount: number, currency: string, rates: Record<string, number>) {
  const normalized = currency.toUpperCase();
  if (normalized === "CNY") {
    return amount;
  }
  const rate = rates[normalized];
  if (!rate || rate <= 0) {
    return amount;
  }
  return amount / rate;
}

export function fromCny(amount: number, currency: string, rates: Record<string, number>) {
  const normalized = currency.toUpperCase();
  if (normalized === "CNY") {
    return amount;
  }
  const rate = rates[normalized];
  if (!rate || rate <= 0) {
    return amount;
  }
  return amount * rate;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampOrder(value: string | null) {
  return value?.toLowerCase() === "asc" ? "ASC" : "DESC";
}

export function clampLocationSort(value: string | null) {
  if (value === "current_amount" || value === "created_at" || value === "updated_at" || value === "name") {
    return value;
  }
  return "created_at";
}
