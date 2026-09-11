import { getFallbackRates, isRecord, isUsableRate, isoDate, type ExchangeRates } from "@asset-dashboard/domain";
import { getPublicExchangeRates } from "./api.ts";

const RATE_CACHE_KEY = "asset-dashboard-rate-cache-v1";

function parseRates(value: unknown): ExchangeRates | null {
  if (!isRecord(value) || value.base !== "CNY" || !isRecord(value.rates) || typeof value.updated_at !== "string") {
    return null;
  }
  const rates: Record<string, number> = { CNY: 1 };
  for (const [currency, rate] of Object.entries(value.rates)) {
    if (isUsableRate(rate)) rates[currency.toUpperCase()] = rate;
  }
  return {
    base: "CNY",
    rates,
    updated_at: isoDate(value.updated_at, "updated_at"),
    source: typeof value.source === "string" ? value.source : undefined,
    fetched_at: typeof value.fetched_at === "string" ? value.fetched_at : undefined
  };
}

export function readRateCache() {
  try {
    const cached = parseRates(JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null"));
    return cached || getFallbackRates();
  } catch {
    return getFallbackRates();
  }
}

export function writeRateCache(rates: ExchangeRates) {
  localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(rates));
}

export async function seedRateCache() {
  const current = readRateCache();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const next = parseRates(await getPublicExchangeRates(controller.signal));
    if (next) {
      writeRateCache(next);
      return next;
    }
  } catch {
    // The local cache remains the source of truth when the public seed request is unavailable.
  } finally {
    window.clearTimeout(timeout);
  }
  return current;
}
