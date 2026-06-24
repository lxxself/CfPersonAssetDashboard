import type { AssetHistoryRow, AssetLocationRow, TrendPoint } from "./types";
import { roundMoney, toCny } from "./utils";

type BalanceEvent = {
  locationId: string;
  at: string;
  amount: number;
  currency: string;
  isHistory: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

export function buildTotalTrend(
  locations: AssetLocationRow[],
  histories: AssetHistoryRow[],
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
    if (!location) {
      continue;
    }
    events.push({
      locationId: history.location_id,
      at: history.snapshot_time,
      amount: history.final_amount,
      currency: location.currency,
      isHistory: true
    });
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (events.length === 0) {
    return [];
  }

  const balances = new Map<string, { amount: number; currency: string }>();
  const eventPoints: TrendPoint[] = [];
  let index = 0;
  while (index < events.length) {
    const at = events[index].at;
    let recordCount = 0;
    while (index < events.length && events[index].at === at) {
      const event = events[index];
      balances.set(event.locationId, { amount: event.amount, currency: event.currency });
      if (event.isHistory) {
        recordCount += 1;
      }
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

export function buildLocationTrend(location: AssetLocationRow, histories: AssetHistoryRow[], range = "all"): TrendPoint[] {
  const historyPoints: TrendPoint[] = histories
    .slice()
    .sort((a, b) => Date.parse(a.snapshot_time) - Date.parse(b.snapshot_time))
    .map((history) => ({
      date: history.snapshot_time,
      value_cny: roundMoney(history.final_amount),
      source: "event",
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

  const filtered = filterByRange(points, range);
  return fillSparseTrend(filtered);
}

function sumBalancesCny(balances: Map<string, { amount: number; currency: string }>, rates: Record<string, number>) {
  let total = 0;
  for (const balance of balances.values()) {
    total += toCny(balance.amount, balance.currency, rates);
  }
  return total;
}

function filterByRange(points: TrendPoint[], range: string): TrendPoint[] {
  if (range === "all" || points.length < 2) {
    return points;
  }

  const end = Date.parse(points[points.length - 1].date);
  const days = range === "1w" ? 7 : range === "1m" ? 31 : range === "6m" ? 183 : range === "1y" ? 365 : undefined;
  if (!days) {
    return points;
  }

  const start = end - days * DAY;
  const filtered = points.filter((point) => Date.parse(point.date) >= start);
  let previous: TrendPoint | undefined;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (Date.parse(points[index].date) < start) {
      previous = points[index];
      break;
    }
  }
  if (previous) {
    return [
      {
        ...previous,
        date: new Date(start).toISOString(),
        source: "filled" as const,
        record_count: 0
      },
      ...filtered
    ];
  }
  return filtered;
}

function fillSparseTrend(points: TrendPoint[]) {
  if (points.length < 2) {
    return points;
  }

  const start = Date.parse(points[0].date);
  const end = Date.parse(points[points.length - 1].date);
  const spanDays = Math.max(1, Math.ceil((end - start) / DAY));
  const stepDays = spanDays <= 45 ? 1 : spanDays <= 400 ? 7 : 30;
  const step = stepDays * DAY;
  const filled: TrendPoint[] = [];
  let cursor = start;
  let pointIndex = 0;
  let current = points[0];

  while (cursor <= end) {
    while (pointIndex < points.length && Date.parse(points[pointIndex].date) <= cursor) {
      current = points[pointIndex];
      if (!filled.some((item) => item.date === current.date)) {
        filled.push(current);
      }
      pointIndex += 1;
    }

    const cursorDate = new Date(cursor).toISOString();
    if (!filled.some((item) => item.date === cursorDate)) {
      filled.push({
        date: cursorDate,
        value_cny: current.value_cny,
        source: "filled",
        record_count: 0
      });
    }

    cursor += step;
  }

  for (; pointIndex < points.length; pointIndex += 1) {
    if (!filled.some((item) => item.date === points[pointIndex].date)) {
      filled.push(points[pointIndex]);
    }
  }

  return filled.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
