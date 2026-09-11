import type { AssetHistory, AssetLocation, BackupFile, ExchangeRates, Summary, TrendPoint } from "@asset-dashboard/domain";

export type StoreMode = "online" | "offline";

export type LocationDraft = {
  name: string;
  currency: string;
  initial_amount: number;
  current_amount?: number;
  tags: string[];
};

export type HistoryDraft = {
  final_amount: number;
  snapshot_time: string;
  note: string;
};

export type DashboardSnapshot = {
  summary: Summary;
  locations: AssetLocation[];
};

export type LocationDetails = {
  history: AssetHistory[];
  trend: TrendPoint[];
};

export type RestoreResult = {
  restored: true;
  locations: number;
  history_records: number;
  rates?: ExchangeRates;
};

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

export interface DashboardStore {
  readonly mode: StoreMode;
  readonly canSyncRates: boolean;
  loadDashboard(params: URLSearchParams): Promise<DashboardSnapshot>;
  loadLocationDetails(locationId: string, range: string): Promise<LocationDetails>;
  saveLocation(locationId: string | null, body: LocationDraft): Promise<{ item: AssetLocation }>;
  deleteLocation(locationId: string): Promise<{ deleted: boolean }>;
  saveHistory(locationId: string, historyId: string | null, body: HistoryDraft): Promise<{ item: AssetHistory }>;
  deleteHistory(historyId: string): Promise<{ deleted: boolean }>;
  exportBackup(): Promise<BackupFile>;
  restoreBackup(backup: BackupFile): Promise<RestoreResult>;
  refreshExchangeRates(): Promise<ExchangeRates>;
}
