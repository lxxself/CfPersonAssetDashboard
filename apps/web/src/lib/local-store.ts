import {
  calculateSummary,
  createBackup,
  getAvailableCurrencies,
  isoDate,
  isRecord,
  normalizeCurrency,
  normalizeTags,
  parseBackup,
  recalculateBalances,
  requiredString,
  toNumber,
  buildLocationTrend,
  type AssetHistory,
  type AssetLocation,
  type BackupFile,
  type ExchangeRates
} from "@asset-dashboard/domain";
import { readRateCache, writeRateCache } from "./rates.ts";
import type {
  DashboardSnapshot,
  DashboardStore,
  HistoryDraft,
  LocationDetails,
  LocationDraft,
  RestoreResult
} from "./store.ts";
import { StoreError } from "./store.ts";

const LOCAL_DATA_KEY = "asset-dashboard-offline-v1";
const LOCAL_DATA_FORMAT = "cf-personal-asset-dashboard-offline";
const LOCAL_DATA_VERSION = 1;

type LocalDatabase = {
  format: typeof LOCAL_DATA_FORMAT;
  version: typeof LOCAL_DATA_VERSION;
  updated_at: string;
  data: {
    asset_locations: AssetLocation[];
    asset_history: AssetHistory[];
  };
};

function emptyDatabase(): LocalDatabase {
  return {
    format: LOCAL_DATA_FORMAT,
    version: LOCAL_DATA_VERSION,
    updated_at: new Date().toISOString(),
    data: { asset_locations: [], asset_history: [] }
  };
}

function parseLocalDatabase(value: unknown): LocalDatabase {
  if (!isRecord(value) || value.format !== LOCAL_DATA_FORMAT || value.version !== LOCAL_DATA_VERSION || !isRecord(value.data)) {
    throw new StoreError("本地数据格式无法识别，请清理本机数据后重新开始或导入备份");
  }
  if (!Array.isArray(value.data.asset_locations) || !Array.isArray(value.data.asset_history)) {
    throw new StoreError("本地数据不完整，请清理本机数据后重新开始或导入备份");
  }
  const locations = value.data.asset_locations.map((item, index) => parseLocalLocation(item, index));
  const histories = value.data.asset_history.map((item, index) => parseLocalHistory(item, index));
  const locationIds = new Set(locations.map((item) => item.id));
  if (new Set(locations.map((item) => item.id)).size !== locations.length || new Set(histories.map((item) => item.id)).size !== histories.length) {
    throw new StoreError("本地数据包含重复记录，请清理本机数据后重新开始或导入备份");
  }
  if (histories.some((item) => !locationIds.has(item.location_id))) {
    throw new StoreError("本地数据包含孤立历史记录，请清理本机数据后重新开始或导入备份");
  }
  const recalculated = recalculateBalances(locations, histories);
  return {
    format: LOCAL_DATA_FORMAT,
    version: LOCAL_DATA_VERSION,
    updated_at: isoDate(value.updated_at, "updated_at"),
    data: { asset_locations: recalculated.locations, asset_history: recalculated.histories }
  };
}

function parseLocalLocation(value: unknown, index: number): AssetLocation {
  if (!isRecord(value)) throw new StoreError(`本地资产位置 ${index + 1} 格式无效`);
  return {
    id: requiredString(value.id, `asset_locations[${index}].id`),
    name: requiredString(value.name, `asset_locations[${index}].name`).trim(),
    currency: normalizeCurrency(value.currency),
    initial_amount: toNumber(value.initial_amount, 0),
    current_amount: toNumber(value.current_amount, 0),
    tags: normalizeTags(value.tags),
    created_at: isoDate(value.created_at, `asset_locations[${index}].created_at`),
    updated_at: isoDate(value.updated_at, `asset_locations[${index}].updated_at`)
  };
}

function parseLocalHistory(value: unknown, index: number): AssetHistory {
  if (!isRecord(value)) throw new StoreError(`本地历史记录 ${index + 1} 格式无效`);
  return {
    id: requiredString(value.id, `asset_history[${index}].id`),
    location_id: requiredString(value.location_id, `asset_history[${index}].location_id`),
    change_amount: toNumber(value.change_amount, 0),
    final_amount: toNumber(value.final_amount, 0),
    snapshot_time: isoDate(value.snapshot_time, `asset_history[${index}].snapshot_time`),
    note: value.note === null || value.note === undefined ? null : String(value.note)
  };
}

function createId() {
  return crypto.randomUUID();
}

function sortLocations(locations: AssetLocation[], sort: string | null, order: string | null) {
  const direction = order?.toLowerCase() === "asc" ? 1 : -1;
  const key = sort === "current_amount" || sort === "name" || sort === "updated_at" ? sort : "created_at";
  return locations.slice().sort((a, b) => {
    const left = key === "name" ? a.name : a[key];
    const right = key === "name" ? b.name : b[key];
    const result = typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right);
    return result * direction;
  });
}

export class LocalStore implements DashboardStore {
  readonly mode = "offline" as const;
  readonly canSyncRates = false;
  private database: LocalDatabase;
  private rates: ExchangeRates;
  private loadError: StoreError | null;

  constructor(rates = readRateCache()) {
    this.rates = rates;
    try {
      const raw = localStorage.getItem(LOCAL_DATA_KEY);
      this.database = raw ? parseLocalDatabase(JSON.parse(raw)) : emptyDatabase();
      this.loadError = null;
    } catch (error) {
      this.database = emptyDatabase();
      this.loadError = error instanceof StoreError ? error : new StoreError("本地数据无法读取，请清理本机数据后重新开始或导入备份");
    }
  }

  private ensureReadable() {
    if (this.loadError) throw this.loadError;
  }

  private persist(locations: AssetLocation[], histories: AssetHistory[]) {
    const recalculated = recalculateBalances(locations, histories);
    this.database = {
      format: LOCAL_DATA_FORMAT,
      version: LOCAL_DATA_VERSION,
      updated_at: new Date().toISOString(),
      data: { asset_locations: recalculated.locations, asset_history: recalculated.histories }
    };
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(this.database));
    } catch {
      throw new StoreError("本地存储空间不足，数据没有保存");
    }
  }

  async loadDashboard(params: URLSearchParams): Promise<DashboardSnapshot> {
    this.ensureReadable();
    const currency = params.get("currency")?.toUpperCase();
    const tags = params.getAll("tag").concat((params.get("tags") || "").split(",")).map((tag) => tag.trim()).filter(Boolean);
    const locations = this.database.data.asset_locations.filter((location) => {
      return (!currency || location.currency === currency) && tags.every((tag) => location.tags.includes(tag));
    });
    const summary = calculateSummary(this.database.data.asset_locations, this.database.data.asset_history, this.rates);
    return { summary, locations: sortLocations(locations, params.get("sort"), params.get("order")) };
  }

  async loadLocationDetails(locationId: string, range: string): Promise<LocationDetails> {
    this.ensureReadable();
    const location = this.database.data.asset_locations.find((item) => item.id === locationId);
    if (!location) throw new StoreError("资产位置不存在");
    const history = this.database.data.asset_history
      .filter((item) => item.location_id === locationId)
      .sort((a, b) => Date.parse(b.snapshot_time) - Date.parse(a.snapshot_time));
    return { history, trend: buildLocationTrend(location, history, range) };
  }

  async saveLocation(locationId: string | null, body: LocationDraft) {
    this.ensureReadable();
    const name = body.name.trim();
    if (!name) throw new StoreError("资产名称不能为空");
    const currency = normalizeCurrency(body.currency);
    if (!locationId && !getAvailableCurrencies(this.rates).includes(currency)) {
      throw new StoreError("该币种没有可用的本地汇率，请先在线缓存汇率");
    }
    const initialAmount = toNumber(body.initial_amount, 0);
    const now = new Date().toISOString();
    const locations = this.database.data.asset_locations.map((item) => ({ ...item, tags: [...item.tags] }));
    const histories = this.database.data.asset_history.map((item) => ({ ...item }));
    let item: AssetLocation;

    if (locationId) {
      const current = locations.find((location) => location.id === locationId);
      if (!current) throw new StoreError("资产位置不存在");
      if (currency !== current.currency && !getAvailableCurrencies(this.rates).includes(currency)) {
        throw new StoreError("该币种没有可用的本地汇率，请先在线缓存汇率");
      }
      if (currency !== current.currency && histories.some((history) => history.location_id === locationId)) {
        throw new StoreError("已有历史记录后不能修改货币类型");
      }
      item = {
        ...current,
        name,
        currency,
        initial_amount: initialAmount,
        tags: normalizeTags(body.tags),
        updated_at: now
      };
      locations[locations.findIndex((location) => location.id === locationId)] = item;
    } else {
      item = {
        id: createId(),
        name,
        currency,
        initial_amount: initialAmount,
        current_amount: body.current_amount === undefined ? initialAmount : toNumber(body.current_amount, initialAmount),
        tags: normalizeTags(body.tags),
        created_at: now,
        updated_at: now
      };
      locations.push(item);
    }

    this.persist(locations, histories);
    return { item: this.database.data.asset_locations.find((location) => location.id === item.id) as AssetLocation };
  }

  async deleteLocation(locationId: string) {
    this.ensureReadable();
    const locations = this.database.data.asset_locations.filter((location) => location.id !== locationId);
    const histories = this.database.data.asset_history.filter((history) => history.location_id !== locationId);
    const deleted = locations.length !== this.database.data.asset_locations.length;
    if (deleted) this.persist(locations, histories);
    return { deleted };
  }

  async saveHistory(locationId: string, historyId: string | null, body: HistoryDraft) {
    this.ensureReadable();
    const location = this.database.data.asset_locations.find((item) => item.id === locationId);
    if (!location) throw new StoreError("资产位置不存在");
    const finalAmount = toNumber(body.final_amount, Number.NaN);
    if (!Number.isFinite(finalAmount)) throw new StoreError("金额必须是有效数字");
    const snapshotTime = isoDate(body.snapshot_time, "snapshot_time");
    const locations = this.database.data.asset_locations.map((item) => ({ ...item, tags: [...item.tags] }));
    const histories = this.database.data.asset_history.map((item) => ({ ...item }));
    const now = new Date().toISOString();
    const next: AssetHistory = {
      id: historyId || createId(),
      location_id: locationId,
      change_amount: 0,
      final_amount: finalAmount,
      snapshot_time: snapshotTime,
      note: body.note ? body.note : null
    };
    const index = historyId ? histories.findIndex((item) => item.id === historyId) : -1;
    if (historyId && index < 0) throw new StoreError("历史记录不存在");
    if (index >= 0) histories[index] = next;
    else histories.push(next);
    const locationIndex = locations.findIndex((item) => item.id === locationId);
    locations[locationIndex] = { ...locations[locationIndex], updated_at: now };
    this.persist(locations, histories);
    return { item: this.database.data.asset_history.find((item) => item.id === next.id) as AssetHistory };
  }

  async deleteHistory(historyId: string) {
    this.ensureReadable();
    const histories = this.database.data.asset_history.filter((history) => history.id !== historyId);
    const deleted = histories.length !== this.database.data.asset_history.length;
    if (deleted) this.persist(this.database.data.asset_locations, histories);
    return { deleted };
  }

  async exportBackup() {
    this.ensureReadable();
    return createBackup(this.database.data.asset_locations, this.database.data.asset_history, this.rates);
  }

  async restoreBackup(backup: BackupFile): Promise<RestoreResult> {
    const parsed = parseBackup(backup);
    this.persist(parsed.data.asset_locations, parsed.data.asset_history);
    this.loadError = null;
    if (parsed.exchange_rates) {
      this.rates = parsed.exchange_rates;
      writeRateCache(parsed.exchange_rates);
    }
    return {
      restored: true,
      locations: parsed.data.asset_locations.length,
      history_records: parsed.data.asset_history.length,
      rates: parsed.exchange_rates
    };
  }

  async refreshExchangeRates(): Promise<ExchangeRates> {
    throw new StoreError("离线模式不会同步云端汇率");
  }
}
