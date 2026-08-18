import type { Bindings, ExchangeRatesCache } from "./types";
import { EXCHANGE_RATES_KEY, getFallbackRates, todayIsoDate } from "./utils";

type ExchangeApiResponse = {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
};

export async function getExchangeRates(env: Bindings): Promise<ExchangeRatesCache> {
  const cached = await env.ASSET_KV.get<ExchangeRatesCache>(EXCHANGE_RATES_KEY, "json");
  if (cached?.base === "CNY" && cached.rates) {
    return cached;
  }
  return getFallbackRates();
}

export async function refreshExchangeRates(env: Bindings) {
  const url = env.EXCHANGE_RATE_API_URL || "https://open.er-api.com/v6/latest/CNY";
  const response = await fetch(url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Exchange API failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ExchangeApiResponse;
  if (payload.result && payload.result !== "success") {
    throw new Error(`Exchange API returned result=${payload.result}`);
  }
  if (payload.base_code !== "CNY" || !payload.rates?.CNY) {
    throw new Error("Exchange API response is not CNY based");
  }

  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(payload.rates)) {
    if (/^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0) {
      rates[currency] = rate;
    }
  }
  rates.CNY = 1;

  const cache: ExchangeRatesCache = {
    base: "CNY",
    rates,
    updated_at: todayIsoDate(new Date()),
    source: "open.er-api.com",
    fetched_at: new Date().toISOString()
  };

  await env.ASSET_KV.put(EXCHANGE_RATES_KEY, JSON.stringify(cache));
  return cache;
}
