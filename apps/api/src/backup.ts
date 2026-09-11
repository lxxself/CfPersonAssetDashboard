import { createBackup as createDomainBackup, parseBackup } from "@asset-dashboard/domain";
import type { BackupFile } from "@asset-dashboard/domain";
import type { AssetHistoryRow, AssetLocationRow, Bindings } from "./types";
import { getExchangeRates } from "./exchange";
import { toAssetLocation } from "./utils";

export const BACKUP_FORMAT = "cf-personal-asset-dashboard";
export const BACKUP_VERSION = 1;
export type DashboardBackup = BackupFile;

export async function createBackup(env: Bindings): Promise<DashboardBackup> {
  const [locations, histories, rates] = await Promise.all([
    env.DB.prepare("SELECT * FROM asset_locations ORDER BY created_at ASC, id ASC").all<AssetLocationRow>(),
    env.DB.prepare("SELECT * FROM asset_history ORDER BY snapshot_time ASC, id ASC").all<AssetHistoryRow>(),
    getExchangeRates(env)
  ]);
  return createDomainBackup(
    (locations.results || []).map(toAssetLocation),
    histories.results || [],
    rates
  );
}

export async function restoreBackup(env: Bindings, input: unknown) {
  const backup = parseBackup(input);
  const statements = [
    env.DB.prepare("DELETE FROM asset_history"),
    env.DB.prepare("DELETE FROM asset_locations"),
    ...backup.data.asset_locations.map((item) => env.DB.prepare(
      `INSERT INTO asset_locations (id, name, currency, initial_amount, current_amount, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.id,
      item.name,
      item.currency,
      item.initial_amount,
      item.current_amount,
      JSON.stringify(item.tags),
      item.created_at,
      item.updated_at
    )),
    ...backup.data.asset_history.map((item) => env.DB.prepare(
      `INSERT INTO asset_history (id, location_id, change_amount, final_amount, snapshot_time, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(item.id, item.location_id, item.change_amount, item.final_amount, item.snapshot_time, item.note))
  ];
  await env.DB.batch(statements);
  return { locations: backup.data.asset_locations.length, history_records: backup.data.asset_history.length };
}
