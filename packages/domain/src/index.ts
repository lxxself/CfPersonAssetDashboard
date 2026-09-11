export const BACKUP_FORMAT = "cf-personal-asset-dashboard" as const;
export const BACKUP_VERSION = 1 as const;
export const SUPPORTED_CURRENCIES = ["CNY", "USD", "HKD", "EUR", "JPY", "GBP", "SGD"] as const;

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

export type LocationRecord = Pick<AssetLocation, "id" | "name" | "currency" | "initial_amount" | "current_amount" | "created_at" | "updated_at">;

export type TrendPoint = {
  date: string;
  value_cny: number;
  source: "event" | "filled";
  record_count: number;
};

export type ExchangeRates = {
  base: "CNY";
  rates: Record<string, number>;
  updated_at: string;
  source?: string;
  fetched_at?: string;
};

export type Summary = {
  base_currency: "CNY";
  total_cny: number;
  totals: Record<string, number>;
  currencies: string[];
  available_currencies: string[];
  unsupported_currencies: string[];
  exchange_rates_updated_at: string;
  trend: TrendPoint[];
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  base_currency: "CNY";
  exchange_rates?: ExchangeRates;
  data: {
    asset_locations: AssetLocation[];
    asset_history: AssetHistory[];
  };
};

export type RestoredData = {
  asset_locations: AssetLocation[];
  asset_history: AssetHistory[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

export function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

export function isoDate(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!Number.isFinite(Date.parse(result))) {
    throw new Error(`${field} must be a valid date`);
  }
  return result;
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

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isUsableRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function getFallbackRates(): ExchangeRates {
  return {
    base: "CNY",
    rates: { CNY: 1 },
    updated_at: todayIsoDate(),
    source: "fallback",
    fetched_at: new Date().toISOString()
  };
}

export function getAvailableCurrencies(rates: ExchangeRates, candidates: readonly string[] = SUPPORTED_CURRENCIES) {
  return candidates.filter((currency) => currency === "CNY" || isUsableRate(rates.rates[currency]));
}

export function toCny(amount: number, currency: string, rates: Record<string, number>) {
  const normalized = currency.toUpperCase();
  if (normalized === "CNY") {
    return amount;
  }
  const rate = rates[normalized];
  return isUsableRate(rate) ? amount / rate : null;
}

export function fromCny(amount: number, currency: string, rates: Record<string, number>) {
  const normalized = currency.toUpperCase();
  if (normalized === "CNY") {
    return amount;
  }
  const rate = rates[normalized];
  return isUsableRate(rate) ? amount * rate : null;
}

export function recalculateBalances(locations: AssetLocation[], histories: AssetHistory[]) {
  const nextLocations = locations.map((location) => ({ ...location, tags: [...location.tags] }));
  const nextHistories = histories.map((history) => ({ ...history }));
  const byLocation = new Map<string, AssetHistory[]>();

  for (const history of nextHistories) {
    const rows = byLocation.get(history.location_id) || [];
    rows.push(history);
    byLocation.set(history.location_id, rows);
  }

  for (const location of nextLocations) {
    const rows = (byLocation.get(location.id) || []).sort(
      (a, b) => Date.parse(a.snapshot_time) - Date.parse(b.snapshot_time) || a.id.localeCompare(b.id)
    );
    let previousAmount = location.initial_amount;
    let currentAmount = location.initial_amount;
    for (const history of rows) {
      history.change_amount = roundMoney(history.final_amount - previousAmount);
      previousAmount = history.final_amount;
      currentAmount = history.final_amount;
    }
    location.current_amount = currentAmount;
  }

  return { locations: nextLocations, histories: nextHistories };
}

export function calculateSummary(locations: LocationRecord[], histories: AssetHistory[], rates: ExchangeRates): Summary {
  const currencies = Array.from(new Set(["CNY", ...locations.map((location) => location.currency.toUpperCase())]));
  const unsupportedCurrencies = currencies.filter(
    (currency) => currency !== "CNY" && !isUsableRate(rates.rates[currency])
  );
  const totalCny = locations.reduce((sum, location) => {
    const value = toCny(location.current_amount, location.currency, rates.rates);
    return sum + (value ?? 0);
  }, 0);
  const availableCurrencies = currencies.filter(
    (currency) => currency === "CNY" || isUsableRate(rates.rates[currency])
  );
  const totals = Object.fromEntries(
    availableCurrencies.map((currency) => [currency, roundMoney(fromCny(totalCny, currency, rates.rates) ?? totalCny)])
  );

  return {
    base_currency: "CNY",
    total_cny: roundMoney(totalCny),
    totals,
    currencies,
    available_currencies: availableCurrencies,
    unsupported_currencies: unsupportedCurrencies,
    exchange_rates_updated_at: rates.updated_at,
    trend: buildTotalTrend(locations, histories, rates.rates)
  };
}

type BalanceEvent = {
  locationId: string;
  at: string;
  amount: number;
  currency: string;
  isHistory: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

export function buildTotalTrend(
  locations: LocationRecord[],
  histories: AssetHistory[],
  rates: Record<string, number>
): TrendPoint[] {
  const events: BalanceEvent[] = [];
  for (const location of locations) {
    events.push({
      locationId: location.id,
      at: location.created_at,
      amount: location.initial_amount,
      currency: location.currency,
      isHistory: false
    });
  }
  for (const history of histories) {
    const location = locations.find((item) => item.id === history.location_id);
    if (!location) continue;
    events.push({
      locationId: history.location_id,
      at: history.snapshot_time,
      amount: history.final_amount,
      currency: location.currency,
      isHistory: true
    });
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (events.length === 0) return [];

  const balances = new Map<string, { amount: number; currency: string }>();
  const eventPoints: TrendPoint[] = [];
  let index = 0;
  while (index < events.length) {
    const at = events[index].at;
    let recordCount = 0;
    while (index < events.length && events[index].at === at) {
      const event = events[index];
      balances.set(event.locationId, { amount: event.amount, currency: event.currency });
      if (event.isHistory) recordCount += 1;
      index += 1;
    }
    eventPoints.push({
      date: at,
      value_cny: roundMoney(sumBalancesCny(balances, rates)),
      source: "event",
      record_count: recordCount
    });
  }

  return fillSparseTrend(eventPoints);
}

export function buildLocationTrend(location: LocationRecord, histories: AssetHistory[], range = "all"): TrendPoint[] {
  const historyPoints = histories
    .slice()
    .sort((a, b) => Date.parse(a.snapshot_time) - Date.parse(b.snapshot_time))
    .map((history) => ({
      date: history.snapshot_time,
      value_cny: roundMoney(history.final_amount),
      source: "event" as const,
      record_count: 1
    }));
  const points: TrendPoint[] = [
    {
      date: location.created_at,
      value_cny: roundMoney(location.initial_amount),
      source: "event",
      record_count: 0
    },
    ...historyPoints
  ];

  return fillSparseTrend(filterByRange(points, range));
}

function sumBalancesCny(balances: Map<string, { amount: number; currency: string }>, rates: Record<string, number>) {
  let total = 0;
  for (const balance of balances.values()) {
    total += toCny(balance.amount, balance.currency, rates) ?? 0;
  }
  return total;
}

function filterByRange(points: TrendPoint[], range: string): TrendPoint[] {
  if (range === "all" || points.length < 2) return points;
  const end = Date.parse(points[points.length - 1].date);
  const days = range === "1w" ? 7 : range === "1m" ? 31 : range === "6m" ? 183 : range === "1y" ? 365 : undefined;
  if (!days) return points;

  const start = end - days * DAY;
  const filtered = points.filter((point) => Date.parse(point.date) >= start);
  const previous = points
    .slice()
    .reverse()
    .find((point) => Date.parse(point.date) < start);
  return previous ? [previous, ...filtered] : filtered;
}

function fillSparseTrend(points: TrendPoint[]) {
  if (points.length < 2) return points;
  const filled: TrendPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    filled.push(current);
    const currentTime = Date.parse(current.date);
    const nextTime = Date.parse(next.date);
    const days = Math.floor((nextTime - currentTime) / DAY);
    if (days > 1) {
      for (let day = 1; day < days; day += 1) {
        filled.push({
          date: new Date(currentTime + day * DAY).toISOString(),
          value_cny: current.value_cny,
          source: "filled",
          record_count: 0
        });
      }
    }
  }
  filled.push(points[points.length - 1]);
  return filled;
}

function parseExchangeRates(value: unknown, field = "exchange_rates"): ExchangeRates {
  if (!isRecord(value) || value.base !== "CNY" || !isRecord(value.rates)) {
    throw new Error(`${field} is invalid`);
  }
  const rates: Record<string, number> = { CNY: 1 };
  for (const [currency, rate] of Object.entries(value.rates)) {
    if (isUsableRate(rate)) rates[currency.toUpperCase()] = rate;
  }
  return {
    base: "CNY",
    rates,
    updated_at: isoDate(value.updated_at, `${field}.updated_at`),
    source: typeof value.source === "string" ? value.source : undefined,
    fetched_at: typeof value.fetched_at === "string" ? value.fetched_at : undefined
  };
}

function parseLocation(value: unknown, index: number): AssetLocation {
  if (!isRecord(value)) throw new Error(`asset_locations[${index}] must be an object`);
  const currency = requiredString(value.currency, `asset_locations[${index}].currency`).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`asset_locations[${index}].currency must be a 3-letter code`);
  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) {
    throw new Error(`asset_locations[${index}].tags must be a string array`);
  }
  return {
    id: requiredString(value.id, `asset_locations[${index}].id`),
    name: requiredString(value.name, `asset_locations[${index}].name`).trim(),
    currency,
    initial_amount: requiredNumber(value.initial_amount, `asset_locations[${index}].initial_amount`),
    current_amount: requiredNumber(value.current_amount, `asset_locations[${index}].current_amount`),
    tags: value.tags.map((tag) => tag.trim()).filter(Boolean),
    created_at: isoDate(value.created_at, `asset_locations[${index}].created_at`),
    updated_at: isoDate(value.updated_at, `asset_locations[${index}].updated_at`)
  };
}

function parseHistory(value: unknown, index: number): AssetHistory {
  if (!isRecord(value)) throw new Error(`asset_history[${index}] must be an object`);
  return {
    id: requiredString(value.id, `asset_history[${index}].id`),
    location_id: requiredString(value.location_id, `asset_history[${index}].location_id`),
    change_amount: requiredNumber(value.change_amount, `asset_history[${index}].change_amount`),
    final_amount: requiredNumber(value.final_amount, `asset_history[${index}].final_amount`),
    snapshot_time: isoDate(value.snapshot_time, `asset_history[${index}].snapshot_time`),
    note: value.note === null || value.note === undefined ? null : String(value.note)
  };
}

export function parseBackup(input: unknown): BackupFile {
  if (!isRecord(input) || input.format !== BACKUP_FORMAT || input.version !== BACKUP_VERSION) {
    throw new Error("unsupported backup format or version");
  }
  if (input.base_currency !== "CNY") {
    throw new Error("backup base_currency must be CNY");
  }
  if (!isRecord(input.data) || !Array.isArray(input.data.asset_locations) || !Array.isArray(input.data.asset_history)) {
    throw new Error("backup data is incomplete");
  }

  const locations = input.data.asset_locations.map(parseLocation);
  const histories = input.data.asset_history.map(parseHistory);
  const locationIds = new Set(locations.map((item) => item.id));
  if (new Set(locations.map((item) => item.id)).size !== locations.length) {
    throw new Error("backup contains duplicate asset location ids");
  }
  if (new Set(histories.map((item) => item.id)).size !== histories.length) {
    throw new Error("backup contains duplicate history ids");
  }
  if (histories.some((item) => !locationIds.has(item.location_id))) {
    throw new Error("backup contains history for an unknown asset location");
  }

  const recalculated = recalculateBalances(locations, histories);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: isoDate(input.exported_at, "exported_at"),
    base_currency: "CNY",
    exchange_rates: input.exchange_rates === undefined ? undefined : parseExchangeRates(input.exchange_rates),
    data: {
      asset_locations: recalculated.locations,
      asset_history: recalculated.histories
    }
  };
}

export function createBackup(locations: AssetLocation[], histories: AssetHistory[], rates?: ExchangeRates): BackupFile {
  const recalculated = recalculateBalances(locations, histories);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    base_currency: "CNY",
    exchange_rates: rates,
    data: {
      asset_locations: recalculated.locations,
      asset_history: recalculated.histories
    }
  };
}
