import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, AssetHistoryRow, AssetLocationRow } from "./types";
import { getExchangeRates, refreshExchangeRates } from "./exchange";
import { recalculateLocationBalance } from "./history";
import { createBackup, restoreBackup } from "./backup";
import { buildLocationTrend, buildTotalTrend } from "./trends";
import {
  clampLocationSort,
  clampOrder,
  fromCny,
  jsonError,
  normalizeCurrency,
  normalizeTags,
  roundMoney,
  toAssetLocation,
  toCny,
  toNumber
} from "./utils";

export const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  })
);

app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS" || c.req.path === "/api/health") {
    return next();
  }
  const password = c.env.DASHBOARD_PASSWORD;
  if (!password) {
    return next();
  }
  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token !== password) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/exchange-rates", async (c) => {
  return c.json(await getExchangeRates(c.env));
});

app.post("/api/exchange-rates/refresh", async (c) => {
  try {
    return c.json(await refreshExchangeRates(c.env));
  } catch (error) {
    console.warn(JSON.stringify({ event: "exchange_rates_refresh_failed", message: String(error) }));
    return c.json(await getExchangeRates(c.env), 202);
  }
});

app.get("/api/backup", async (c) => {
  const backup = await createBackup(c.env);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="asset-dashboard-backup-${backup.exported_at.slice(0, 10)}.json"`,
      "cache-control": "no-store"
    }
  });
});

app.post("/api/backup/restore", async (c) => {
  try {
    const result = await restoreBackup(c.env, await c.req.json<unknown>());
    return c.json({ restored: true, ...result });
  } catch (error) {
    console.warn(JSON.stringify({ event: "backup_restore_rejected", message: String(error) }));
    return jsonError(error instanceof Error ? error.message : "invalid backup file");
  }
});

app.get("/api/asset-locations", async (c) => {
  const url = new URL(c.req.url);
  const currency = url.searchParams.get("currency")?.toUpperCase();
  const tags = url.searchParams.getAll("tag").concat((url.searchParams.get("tags") || "").split(",")).filter(Boolean);
  const sort = clampLocationSort(url.searchParams.get("sort"));
  const order = clampOrder(url.searchParams.get("order"));

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (currency) {
    conditions.push("currency = ?");
    params.push(currency);
  }
  for (const tag of tags) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(asset_locations.tags) WHERE value = ?)");
    params.push(tag.trim());
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `SELECT * FROM asset_locations ${where} ORDER BY ${sort} ${order}`;
  const result = await c.env.DB.prepare(query).bind(...params).all<AssetLocationRow>();
  return c.json({ items: (result.results || []).map(toAssetLocation) });
});

app.post("/api/asset-locations", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const name = String(body.name || "").trim();
  if (!name) {
    return jsonError("name is required");
  }

  if (typeof body.currency !== "string" || !/^[a-zA-Z]{3}$/.test(body.currency)) {
    return jsonError("currency is required");
  }
  const currency = normalizeCurrency(body.currency);
  const initialAmount = toNumber(body.initial_amount, 0);
  const currentAmount = body.current_amount === undefined ? initialAmount : toNumber(body.current_amount, initialAmount);
  const tags = normalizeTags(body.tags);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const row = await c.env.DB.prepare(
    `INSERT INTO asset_locations (id, name, currency, initial_amount, current_amount, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(id, name, currency, initialAmount, currentAmount, JSON.stringify(tags), now, now)
    .first<AssetLocationRow>();

  return c.json({ item: row ? toAssetLocation(row) : null }, 201);
});

app.get("/api/asset-locations/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?")
    .bind(c.req.param("id"))
    .first<AssetLocationRow>();
  if (!row) {
    return jsonError("asset location not found", 404);
  }
  return c.json({ item: toAssetLocation(row) });
});

app.patch("/api/asset-locations/:id", async (c) => {
  const id = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?").bind(id).first<AssetLocationRow>();
  if (!current) {
    return jsonError("asset location not found", 404);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const name = body.name === undefined ? current.name : String(body.name).trim();
  if (!name) {
    return jsonError("name cannot be empty");
  }

  const currency = body.currency === undefined ? current.currency : normalizeCurrency(body.currency, current.currency);
  if (currency !== current.currency) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM asset_history WHERE location_id = ?")
      .bind(id)
      .first<{ count: number }>();
    if ((count?.count || 0) > 0) {
      return jsonError("currency cannot be changed after history records exist");
    }
  }
  const initialAmount = body.initial_amount === undefined ? current.initial_amount : toNumber(body.initial_amount, current.initial_amount);
  const currentAmount = body.current_amount === undefined ? current.current_amount : toNumber(body.current_amount, current.current_amount);
  const tags = body.tags === undefined ? current.tags : JSON.stringify(normalizeTags(body.tags));

  const row = await c.env.DB.prepare(
    `UPDATE asset_locations
     SET name = ?, currency = ?, initial_amount = ?, current_amount = ?, tags = ?
     WHERE id = ?
     RETURNING *`
  )
    .bind(name, currency, initialAmount, currentAmount, tags, id)
    .first<AssetLocationRow>();

  if (row) {
    await recalculateLocationBalance(c.env, row);
    const refreshed = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?").bind(id).first<AssetLocationRow>();
    return c.json({ item: refreshed ? toAssetLocation(refreshed) : toAssetLocation(row) });
  }

  return c.json({ item: null });
});

app.delete("/api/asset-locations/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM asset_locations WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ deleted: result.meta.changes > 0 });
});

app.get("/api/asset-locations/:id/history", async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const conditions = ["location_id = ?"];
  const params: unknown[] = [c.req.param("id")];
  if (from) {
    conditions.push("snapshot_time >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("snapshot_time <= ?");
    params.push(to);
  }

  const result = await c.env.DB.prepare(
    `SELECT * FROM asset_history WHERE ${conditions.join(" AND ")} ORDER BY snapshot_time DESC`
  )
    .bind(...params)
    .all<AssetHistoryRow>();
  return c.json({ items: result.results || [] });
});

app.get("/api/asset-locations/:id/trend", async (c) => {
  const id = c.req.param("id");
  const range = new URL(c.req.url).searchParams.get("range") || "all";
  const location = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?").bind(id).first<AssetLocationRow>();
  if (!location) {
    return jsonError("asset location not found", 404);
  }
  const historyResult = await c.env.DB.prepare(
    "SELECT * FROM asset_history WHERE location_id = ? ORDER BY snapshot_time ASC"
  )
    .bind(id)
    .all<AssetHistoryRow>();

  return c.json({
    currency: location.currency,
    trend: buildLocationTrend(location, historyResult.results || [], range)
  });
});

app.post("/api/asset-locations/:id/history", async (c) => {
  const locationId = c.req.param("id");
  const location = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?").bind(locationId).first<AssetLocationRow>();
  if (!location) {
    return jsonError("asset location not found", 404);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const finalAmount = toNumber(body.final_amount ?? body.amount ?? body.current_amount, Number.NaN);
  if (!Number.isFinite(finalAmount)) {
    return jsonError("final_amount must be a number");
  }
  const changeAmount = finalAmount - location.current_amount;
  const snapshotTime = typeof body.snapshot_time === "string" ? body.snapshot_time : new Date().toISOString();
  const note = body.note === undefined ? null : String(body.note);
  const historyId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO asset_history (id, location_id, change_amount, final_amount, snapshot_time, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(historyId, locationId, changeAmount, finalAmount, snapshotTime, note)
    .run();
  await recalculateLocationBalance(c.env, location);

  const row = await c.env.DB.prepare("SELECT * FROM asset_history WHERE id = ?").bind(historyId).first<AssetHistoryRow>();
  return c.json({ item: row }, 201);
});

app.patch("/api/asset-history/:id", async (c) => {
  const id = c.req.param("id");
  const history = await c.env.DB.prepare("SELECT * FROM asset_history WHERE id = ?").bind(id).first<AssetHistoryRow>();
  if (!history) {
    return jsonError("asset history not found", 404);
  }
  const location = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?")
    .bind(history.location_id)
    .first<AssetLocationRow>();
  if (!location) {
    return jsonError("asset location not found", 404);
  }

  const body = await c.req.json<Record<string, unknown>>();
  const finalAmount =
    body.final_amount === undefined && body.amount === undefined && body.current_amount === undefined
      ? history.final_amount
      : toNumber(body.final_amount ?? body.amount ?? body.current_amount, Number.NaN);
  if (!Number.isFinite(finalAmount)) {
    return jsonError("final_amount must be a number");
  }
  const snapshotTime = typeof body.snapshot_time === "string" ? body.snapshot_time : history.snapshot_time;
  const note = body.note === undefined ? history.note : body.note === null ? null : String(body.note);

  await c.env.DB.prepare(
    "UPDATE asset_history SET final_amount = ?, snapshot_time = ?, note = ? WHERE id = ?"
  )
    .bind(finalAmount, snapshotTime, note, id)
    .run();
  await recalculateLocationBalance(c.env, location);
  const row = await c.env.DB.prepare("SELECT * FROM asset_history WHERE id = ?").bind(id).first<AssetHistoryRow>();
  return c.json({ item: row });
});

app.delete("/api/asset-history/:id", async (c) => {
  const id = c.req.param("id");
  const history = await c.env.DB.prepare("SELECT * FROM asset_history WHERE id = ?").bind(id).first<AssetHistoryRow>();
  if (!history) {
    return c.json({ deleted: false });
  }
  const location = await c.env.DB.prepare("SELECT * FROM asset_locations WHERE id = ?")
    .bind(history.location_id)
    .first<AssetLocationRow>();
  if (!location) {
    return jsonError("asset location not found", 404);
  }

  await c.env.DB.prepare("DELETE FROM asset_history WHERE id = ?").bind(id).run();
  await recalculateLocationBalance(c.env, location);

  return c.json({ deleted: true });
});

app.get("/api/summary", async (c) => {
  const rates = await getExchangeRates(c.env);
  const [locationResult, historyResult] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM asset_locations ORDER BY created_at ASC").all<AssetLocationRow>(),
    c.env.DB.prepare("SELECT * FROM asset_history ORDER BY snapshot_time ASC").all<AssetHistoryRow>()
  ]);
  const locations = locationResult.results || [];
  const histories = historyResult.results || [];
  const totalCny = locations.reduce((sum, location) => sum + toCny(location.current_amount, location.currency, rates.rates), 0);
  const currencies = Array.from(new Set(["CNY", ...locations.map((location) => location.currency.toUpperCase())]));

  return c.json({
    base_currency: "CNY",
    total_cny: roundMoney(totalCny),
    totals: Object.fromEntries(currencies.map((currency) => [currency, roundMoney(fromCny(totalCny, currency, rates.rates))])),
    currencies,
    exchange_rates_updated_at: rates.updated_at,
    trend: buildTotalTrend(locations, histories, rates.rates)
  });
});
