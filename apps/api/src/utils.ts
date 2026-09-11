import type { AssetLocation, AssetLocationRow } from "./types";
import {
  normalizeCurrency,
  normalizeTags,
  roundMoney,
  toCny,
  toNumber,
  todayIsoDate,
  getFallbackRates
} from "@asset-dashboard/domain";

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

export { normalizeCurrency, normalizeTags, roundMoney, toCny, toNumber, todayIsoDate, getFallbackRates };

export function clampOrder(value: string | null) {
  return value?.toLowerCase() === "asc" ? "ASC" : "DESC";
}

export function clampLocationSort(value: string | null) {
  if (value === "current_amount" || value === "created_at" || value === "updated_at" || value === "name") {
    return value;
  }
  return "created_at";
}
