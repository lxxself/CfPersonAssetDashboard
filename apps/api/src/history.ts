import type { AssetHistoryRow, AssetLocationRow, Bindings } from "./types";
import { roundMoney } from "./utils";

export async function recalculateLocationBalance(env: Bindings, location: AssetLocationRow) {
  const histories = await env.DB.prepare(
    "SELECT * FROM asset_history WHERE location_id = ? ORDER BY snapshot_time ASC, id ASC"
  )
    .bind(location.id)
    .all<AssetHistoryRow>();

  let previousAmount = location.initial_amount;
  let currentAmount = location.initial_amount;
  const statements: D1PreparedStatement[] = [];
  for (const history of histories.results || []) {
    const changeAmount = roundMoney(history.final_amount - previousAmount);
    if (history.change_amount !== changeAmount) {
      statements.push(env.DB.prepare("UPDATE asset_history SET change_amount = ? WHERE id = ?").bind(changeAmount, history.id));
    }
    previousAmount = history.final_amount;
    currentAmount = history.final_amount;
  }

  statements.push(env.DB.prepare("UPDATE asset_locations SET current_amount = ? WHERE id = ?").bind(currentAmount, location.id));
  await env.DB.batch(statements);
  return currentAmount;
}
