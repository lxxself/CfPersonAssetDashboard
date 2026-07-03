import type { AssetHistoryRow, AssetLocationRow, Bindings } from "./types";

export const BACKUP_FORMAT = "cf-personal-asset-dashboard";
export const BACKUP_VERSION = 1;

export type DashboardBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  base_currency: "CNY";
  data: {
    asset_locations: Array<Omit<AssetLocationRow, "tags"> & { tags: string[] }>;
    asset_history: AssetHistoryRow[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number`);
  return value;
}

function isoDate(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date`);
  return result;
}

function parseLocation(value: unknown, index: number): AssetLocationRow {
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
    current_amount: 0,
    tags: JSON.stringify(value.tags.map((tag) => tag.trim()).filter(Boolean)),
    created_at: isoDate(value.created_at, `asset_locations[${index}].created_at`),
    updated_at: isoDate(value.updated_at, `asset_locations[${index}].updated_at`)
  };
}

function parseHistory(value: unknown, index: number): AssetHistoryRow {
  if (!isRecord(value)) throw new Error(`asset_history[${index}] must be an object`);
  return {
    id: requiredString(value.id, `asset_history[${index}].id`),
    location_id: requiredString(value.location_id, `asset_history[${index}].location_id`),
    change_amount: 0,
    final_amount: requiredNumber(value.final_amount, `asset_history[${index}].final_amount`),
    snapshot_time: isoDate(value.snapshot_time, `asset_history[${index}].snapshot_time`),
    note: value.note === null || value.note === undefined ? null : String(value.note)
  };
}

export function parseBackup(input: unknown) {
  if (!isRecord(input) || input.format !== BACKUP_FORMAT || input.version !== BACKUP_VERSION) {
    throw new Error("unsupported backup format or version");
  }
  if (!isRecord(input.data) || !Array.isArray(input.data.asset_locations) || !Array.isArray(input.data.asset_history)) {
    throw new Error("backup data is incomplete");
  }
  const asset_locations = input.data.asset_locations.map(parseLocation);
  const asset_history = input.data.asset_history.map(parseHistory);
  const locationIds = new Set(asset_locations.map((item) => item.id));
  if (new Set(asset_locations.map((item) => item.id)).size !== asset_locations.length) {
    throw new Error("backup contains duplicate asset location ids");
  }
  if (new Set(asset_history.map((item) => item.id)).size !== asset_history.length) {
    throw new Error("backup contains duplicate history ids");
  }
  if (asset_history.some((item) => !locationIds.has(item.location_id))) {
    throw new Error("backup contains history for an unknown asset location");
  }

  for (const location of asset_locations) {
    const rows = asset_history
      .filter((item) => item.location_id === location.id)
      .sort((a, b) => a.snapshot_time.localeCompare(b.snapshot_time) || a.id.localeCompare(b.id));
    let previous = location.initial_amount;
    for (const row of rows) {
      row.change_amount = row.final_amount - previous;
      previous = row.final_amount;
    }
    location.current_amount = rows.at(-1)?.final_amount ?? location.initial_amount;
  }
  return { asset_locations, asset_history };
}

export async function createBackup(env: Bindings): Promise<DashboardBackup> {
  const [locations, histories] = await Promise.all([
    env.DB.prepare("SELECT * FROM asset_locations ORDER BY created_at ASC, id ASC").all<AssetLocationRow>(),
    env.DB.prepare("SELECT * FROM asset_history ORDER BY snapshot_time ASC, id ASC").all<AssetHistoryRow>()
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    base_currency: "CNY",
    data: {
      asset_locations: (locations.results || []).map((item) => ({ ...item, tags: JSON.parse(item.tags) as string[] })),
      asset_history: histories.results || []
    }
  };
}

export async function restoreBackup(env: Bindings, input: unknown) {
  const data = parseBackup(input);
  const statements = [
    env.DB.prepare("DELETE FROM asset_history"),
    env.DB.prepare("DELETE FROM asset_locations"),
    ...data.asset_locations.map((item) => env.DB.prepare(
      `INSERT INTO asset_locations (id, name, currency, initial_amount, current_amount, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(item.id, item.name, item.currency, item.initial_amount, item.current_amount, item.tags, item.created_at, item.updated_at)),
    ...data.asset_history.map((item) => env.DB.prepare(
      `INSERT INTO asset_history (id, location_id, change_amount, final_amount, snapshot_time, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(item.id, item.location_id, item.change_amount, item.final_amount, item.snapshot_time, item.note))
  ];
  await env.DB.batch(statements);
  return { locations: data.asset_locations.length, history_records: data.asset_history.length };
}
