import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSummary,
  parseBackup,
  recalculateBalances,
  type AssetHistory,
  type AssetLocation,
  type ExchangeRates
} from "./index.ts";

const rates: ExchangeRates = {
  base: "CNY",
  rates: { CNY: 1, USD: 7.2 },
  updated_at: "2026-09-10"
};

const location: AssetLocation = {
  id: "loc-1",
  name: "现金",
  currency: "CNY",
  initial_amount: 100,
  current_amount: 100,
  tags: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

test("recalculateBalances orders history before calculating changes", () => {
  const histories: AssetHistory[] = [
    { id: "h2", location_id: "loc-1", change_amount: 999, final_amount: 160, snapshot_time: "2026-02-01T00:00:00.000Z", note: null },
    { id: "h1", location_id: "loc-1", change_amount: 999, final_amount: 120, snapshot_time: "2026-01-15T00:00:00.000Z", note: null }
  ];
  const result = recalculateBalances([location], histories);
  assert.equal(result.locations[0].current_amount, 160);
  assert.equal(result.histories.find((item) => item.id === "h1")?.change_amount, 20);
  assert.equal(result.histories.find((item) => item.id === "h2")?.change_amount, 40);
});

test("calculateSummary marks currencies without rates as unsupported", () => {
  const usd: AssetLocation = { ...location, id: "loc-2", name: "美股", currency: "USD", current_amount: 72 };
  const eur: AssetLocation = { ...location, id: "loc-3", name: "欧元", currency: "EUR", current_amount: 50 };
  const summary = calculateSummary([usd, eur], [], rates);
  assert.equal(summary.total_cny, 10);
  assert.deepEqual(summary.available_currencies, ["CNY", "USD"]);
  assert.deepEqual(summary.unsupported_currencies, ["EUR"]);
  assert.equal(summary.totals.EUR, undefined);
});

test("buildTotalTrend keeps unsupported currency balances out of the CNY total", () => {
  const usd: AssetLocation = { ...location, id: "loc-2", currency: "USD", current_amount: 72 };
  const trend = calculateSummary(
    [location, usd],
    [{ id: "h1", location_id: "loc-2", change_amount: 0, final_amount: 72, snapshot_time: "2026-02-01T00:00:00.000Z", note: null }],
    rates
  ).trend;
  assert.equal(trend.at(-1)?.value_cny, 110);
  assert.equal(trend.some((point) => point.source === "filled"), true);
});

test("backup validation rejects a non-CNY base currency", () => {
  assert.throws(() => parseBackup({
    format: "cf-personal-asset-dashboard",
    version: 1,
    exported_at: "2026-09-10T00:00:00.000Z",
    base_currency: "USD",
    data: { asset_locations: [], asset_history: [] }
  }), /base_currency/);
});

test("parseBackup accepts the existing v1 shape and recalculates balances", () => {
  const backup = parseBackup({
    format: "cf-personal-asset-dashboard",
    version: 1,
    exported_at: "2026-09-10T00:00:00.000Z",
    base_currency: "CNY",
    data: {
      asset_locations: [{ ...location, current_amount: 0 }],
      asset_history: [{
        id: "h1",
        location_id: "loc-1",
        change_amount: 0,
        final_amount: 125,
        snapshot_time: "2026-02-01T00:00:00.000Z",
        note: "测试"
      }]
    }
  });
  assert.equal(backup.data.asset_locations[0].current_amount, 125);
  assert.equal(backup.data.asset_history[0].change_amount, 25);
});
