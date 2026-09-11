import { recalculateBalances, type AssetHistory, type AssetLocation } from "@asset-dashboard/domain";
import type { AssetHistoryRow, AssetLocationRow, Bindings } from "./types";

export async function recalculateLocationBalance(env: Bindings, location: AssetLocationRow) {
  const histories = await env.DB.prepare(
    "SELECT * FROM asset_history WHERE location_id = ? ORDER BY snapshot_time ASC, id ASC"
  )
    .bind(location.id)
    .all<AssetHistoryRow>();

  const domainLocation: AssetLocation = {
    ...location,
    currency: location.currency.toUpperCase(),
    tags: []
  };
  const domainHistories: AssetHistory[] = (histories.results || []).map((history) => ({ ...history }));
  const recalculated = recalculateBalances([domainLocation], domainHistories);
  const statements: D1PreparedStatement[] = [];
  for (const history of recalculated.histories) {
    const previous = (histories.results || []).find((item) => item.id === history.id);
    if (previous && previous.change_amount !== history.change_amount) {
      statements.push(env.DB.prepare("UPDATE asset_history SET change_amount = ? WHERE id = ?").bind(history.change_amount, history.id));
    }
  }

  const currentAmount = recalculated.locations[0]?.current_amount ?? location.initial_amount;
  statements.push(env.DB.prepare("UPDATE asset_locations SET current_amount = ? WHERE id = ?").bind(currentAmount, location.id));
  await env.DB.batch(statements);
  return currentAmount;
}
