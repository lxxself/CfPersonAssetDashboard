import type { BackupFile, ExchangeRates } from "@asset-dashboard/domain";
import { api } from "./api";
import type {
  DashboardSnapshot,
  DashboardStore,
  HistoryDraft,
  LocationDetails,
  LocationDraft,
  RestoreResult
} from "./store";

export class RemoteStore implements DashboardStore {
  readonly mode = "online" as const;
  readonly canSyncRates = true;

  async loadDashboard(params: URLSearchParams): Promise<DashboardSnapshot> {
    const [summary, locations] = await Promise.all([api.summary(), api.locations(params)]);
    return { summary, locations: locations.items };
  }

  async loadLocationDetails(locationId: string, range: string): Promise<LocationDetails> {
    const [history, trend] = await Promise.all([api.history(locationId), api.trend(locationId, range)]);
    return { history: history.items, trend: trend.trend };
  }

  saveLocation(locationId: string | null, body: LocationDraft) {
    return locationId ? api.updateLocation(locationId, body) : api.createLocation({ ...body, current_amount: body.initial_amount });
  }

  deleteLocation(locationId: string) {
    return api.deleteLocation(locationId);
  }

  saveHistory(locationId: string, historyId: string | null, body: HistoryDraft) {
    return historyId ? api.updateHistory(historyId, body) : api.createHistory(locationId, body);
  }

  deleteHistory(historyId: string) {
    return api.deleteHistory(historyId);
  }

  exportBackup(): Promise<BackupFile> {
    return api.downloadBackup();
  }

  async restoreBackup(backup: BackupFile): Promise<RestoreResult> {
    return api.restoreBackup(backup);
  }

  refreshExchangeRates(): Promise<ExchangeRates> {
    return api.refreshExchangeRates();
  }
}
