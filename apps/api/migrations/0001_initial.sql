-- Initial D1 migration.
-- Keep this file in sync with ../schema.sql for fresh local databases.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_locations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (length(currency) = 3),
  initial_amount REAL NOT NULL DEFAULT 0,
  current_amount REAL NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS asset_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  location_id TEXT NOT NULL,
  change_amount REAL NOT NULL,
  final_amount REAL NOT NULL,
  snapshot_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  note TEXT,
  FOREIGN KEY (location_id) REFERENCES asset_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_locations_currency
  ON asset_locations(currency);

CREATE INDEX IF NOT EXISTS idx_asset_locations_created_at
  ON asset_locations(created_at);

CREATE INDEX IF NOT EXISTS idx_asset_locations_current_amount
  ON asset_locations(current_amount);

CREATE INDEX IF NOT EXISTS idx_asset_locations_updated_at
  ON asset_locations(updated_at);

CREATE INDEX IF NOT EXISTS idx_asset_history_location_snapshot
  ON asset_history(location_id, snapshot_time);

CREATE INDEX IF NOT EXISTS idx_asset_history_snapshot_time
  ON asset_history(snapshot_time);

CREATE TRIGGER IF NOT EXISTS trg_asset_locations_updated_at
AFTER UPDATE ON asset_locations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE asset_locations
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;
