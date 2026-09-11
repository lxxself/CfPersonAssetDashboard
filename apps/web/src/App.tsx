import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  DatabaseBackup,
  Download,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Tags,
  Trash2,
  Upload,
  WalletCards,
  X
} from "lucide-react";
import { getAvailableCurrencies, parseBackup } from "@asset-dashboard/domain";
import { ApiError, getAuthToken, setAuthToken, type AssetHistory, type AssetLocation, type BackupFile, type ExchangeRates, type Summary, type TrendPoint } from "./lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "./lib/utils";
import { Badge, Button, Card, Field, Select } from "./components/ui";
import { LocalStore } from "./lib/local-store";
import { RemoteStore } from "./lib/remote-store";
import { readRateCache, seedRateCache, writeRateCache } from "./lib/rates";
import type { DashboardStore, RestoreResult, StoreMode } from "./lib/store";

type SortKey = "created_at" | "current_amount" | "name";

const tagColors = [
  "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
];

const MODE_KEY = "asset-dashboard-mode";

function getSavedMode(): StoreMode | null {
  const mode = localStorage.getItem(MODE_KEY);
  return mode === "online" || mode === "offline" ? mode : null;
}

function emptySummary(rates: ExchangeRates): Summary {
  return {
    base_currency: "CNY",
    total_cny: 0,
    totals: { CNY: 0 },
    currencies: ["CNY"],
    available_currencies: ["CNY"],
    unsupported_currencies: [],
    exchange_rates_updated_at: rates.updated_at,
    trend: []
  };
}

export function App() {
  const [dark, setDark] = useState(false);
  const [rates, setRates] = useState<ExchangeRates>(() => readRateCache());
  const [ratesReady, setRatesReady] = useState(false);
  const [mode, setMode] = useState<StoreMode | null>(() => getSavedMode());
  const [summary, setSummary] = useState<Summary>(() => emptySummary(readRateCache()));
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState("CNY");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<AssetLocation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<AssetLocation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [dataError, setDataError] = useState("");
  const [authenticated, setAuthenticated] = useState(() => getSavedMode() === "online" && Boolean(getAuthToken()));
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [backupOpen, setBackupOpen] = useState(false);

  const store = useMemo<DashboardStore | null>(() => {
    if (!mode) return null;
    return mode === "online" ? new RemoteStore() : new LocalStore(rates);
  }, [mode, rates]);

  useEffect(() => {
    let cancelled = false;
    void seedRateCache().then((nextRates) => {
      if (!cancelled) {
        setRates(nextRates);
        setRatesReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    if (!store || (mode === "online" && !authenticated)) return;
    void loadDashboard();
  }, [store, mode, authenticated, selectedTags, currencyFilter, sort]);

  async function loadDashboard() {
    if (!store) return;
    setRefreshing(true);
    setDataError("");
    const params = new URLSearchParams({ sort, order: sort === "name" ? "asc" : "desc" });
    selectedTags.forEach((tag) => params.append("tag", tag));
    if (currencyFilter !== "ALL") {
      params.set("currency", currencyFilter);
    }
    try {
      const next = await store.loadDashboard(params);
      setSummary(next.summary);
      setLocations(next.locations);
      if (!next.summary.available_currencies.includes(selectedCurrency)) {
        setSelectedCurrency("CNY");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
        setAuthToken("");
        setAuthError("请输入正确的访问密码");
        setRefreshing(false);
        return;
      }
      setDataError(error instanceof Error ? error.message : mode === "offline" ? "本地数据读取失败" : "暂时无法连接云端服务");
    } finally {
      setRefreshing(false);
    }
  }

  const allTags = useMemo(() => Array.from(new Set(locations.flatMap((item) => item.tags))).sort(), [locations]);
  const currencies = useMemo(() => Array.from(new Set(["ALL", ...summary.currencies, ...locations.map((item) => item.currency)])), [locations, summary]);
  const availableCurrencies = useMemo(() => getAvailableCurrencies(rates), [rates]);
  const filteredLocations = useMemo(() => {
    return locations.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  }, [locations, query]);

  const totalDisplay = summary.totals[selectedCurrency];
  const totalChange = summary.trend.length > 1 ? summary.total_cny - summary.trend[0].value_cny : 0;

  function chooseMode(nextMode: StoreMode) {
    localStorage.setItem(MODE_KEY, nextMode);
    setMode(nextMode);
    setSummary(emptySummary(rates));
    setLocations([]);
    setSelectedCurrency("CNY");
    setDataError("");
    setSyncError("");
    setSelectedLocation(null);
    setDrawerOpen(false);
    setAuthenticated(nextMode === "online" && Boolean(getAuthToken()));
  }

  function chooseModeLater() {
    setMode(null);
    setAuthenticated(false);
    setAuthError("");
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setAuthToken(password);
    try {
      if (!store || store.mode !== "online") throw new Error("online store is not ready");
      await store.loadDashboard(new URLSearchParams({ sort: "created_at", order: "desc" }));
      setAuthenticated(true);
      setPassword("");
      await loadDashboard();
    } catch (error) {
      setAuthToken("");
      setAuthenticated(false);
      setAuthError(error instanceof ApiError && error.status === 401 ? "密码不正确" : "暂时无法连接服务");
    }
  }

  async function syncExchangeRates() {
    if (!store || !store.canSyncRates) return;
    setSyncing(true);
    setSyncError("");
    try {
      const nextRates = await store.refreshExchangeRates();
      writeRateCache(nextRates);
      setRates(nextRates);
      await loadDashboard();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
        setAuthToken("");
        setAuthError("请输入正确的访问密码");
      } else {
        setSyncError("同步失败，请稍后重试");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function deleteLocation(location: AssetLocation) {
    if (!confirm(`删除「${location.name}」及其全部历史记录？`)) {
      return;
    }
    try {
      if (!store) return;
      await store.deleteLocation(location.id);
      if (selectedLocation?.id === location.id) {
        setSelectedLocation(null);
        setDrawerOpen(false);
      }
      await loadDashboard();
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "删除失败");
    }
  }

  if (!ratesReady) {
    return <main className="flex min-h-screen items-center justify-center px-4 py-8 text-sm text-muted-foreground">正在准备离线数据空间…</main>;
  }

  if (!mode) {
    return <ModeChooser onChoose={chooseMode} />;
  }

  if (mode === "online" && !authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-sm p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
              <WalletCards className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">个人资产看板</h1>
              <p className="text-sm text-muted-foreground">请输入访问密码</p>
            </div>
          </div>
          <form onSubmit={submitLogin} className="mt-5 flex flex-col gap-3">
            <Field
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="访问密码"
            />
            {authError && <p className="text-sm text-rose-500">{authError}</p>}
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              登录
            </Button>
          </form>
          <button className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => chooseMode("offline")}>
            不登录，使用本机离线数据
          </button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
              <WalletCards className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">个人资产看板</h1>
              <p className="text-sm text-muted-foreground">
                汇率同步于 {summary.exchange_rates_updated_at}
                {mode === "offline" ? " · 本机离线数据" : " · 云端数据"}
                {syncError ? <span className="text-rose-500"> · {syncError}</span> : null}
                {dataError ? <span className="text-rose-500"> · {dataError}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setBackupOpen(true)} title="数据备份与恢复">
              <DatabaseBackup className="h-4 w-4" />
              <span className="hidden sm:inline">数据备份</span>
            </Button>
            {mode === "online" && <Button onClick={() => void syncExchangeRates()} disabled={refreshing || syncing} title="手动同步汇率">
              <RefreshCw className={cn("h-4 w-4", (refreshing || syncing) && "animate-spin")} />
              <span className="hidden sm:inline">手动同步</span>
              <span className="sm:hidden">同步</span>
            </Button>}
            {mode === "online" && <Button onClick={() => { setAuthToken(""); setAuthenticated(false); }}>退出登录</Button>}
            <Button onClick={chooseModeLater} title="切换在线或离线模式">切换模式</Button>
            <Button onClick={() => setDark((value) => !value)} title="切换主题">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <Card className="overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">总资产</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <strong className="text-4xl font-semibold tracking-normal sm:text-5xl">
                    {totalDisplay === undefined ? "不可换算" : formatMoney(totalDisplay, selectedCurrency)}
                  </strong>
                  <Select value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value)}>
                    {summary.available_currencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", totalChange >= 0 ? "border-emerald-200 text-emerald-600 dark:border-emerald-900" : "border-rose-200 text-rose-600 dark:border-rose-900")}>
                {totalChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {formatMoney(Math.abs(totalChange), "CNY")}
              </div>
            </div>
            {summary.unsupported_currencies.length > 0 && <p className="mt-3 text-xs text-amber-600">未缓存汇率：{summary.unsupported_currencies.join("、")}。这些币种不会计入换算总额。</p>}
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.trend} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="assetLine" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}万`} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<ChartTooltip currency="CNY" />} />
                  <Area type="monotone" dataKey="value_cny" stroke="#0d9488" strokeWidth={2.5} fill="url(#assetLine)" activeDot={{ r: 6 }} dot={(props) => <EventDot {...props} />} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">资产位置</p>
                <h2 className="text-2xl font-semibold">{locations.length} 个账户</h2>
              </div>
              <Button
                onClick={() => {
                  setEditingLocation(null);
                  setLocationFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                新增资产位置
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Stat label="已记录币种" value={`${summary.currencies.length}`} icon={<CircleDollarSign className="h-4 w-4" />} />
              <Stat label="标签数量" value={`${allTags.length}`} icon={<Tags className="h-4 w-4" />} />
              <Stat label="趋势点" value={`${summary.trend.length}`} icon={<BarChart3 className="h-4 w-4" />} />
              <Stat label="默认币种" value="CNY" icon={<CalendarDays className="h-4 w-4" />} />
            </div>
          </Card>
        </section>

        <Toolbar
          tags={allTags}
          currencies={currencies}
          selectedTags={selectedTags}
          currencyFilter={currencyFilter}
          sort={sort}
          query={query}
          onQuery={setQuery}
          onCurrency={setCurrencyFilter}
          onSort={(value) => setSort(value as SortKey)}
          onTag={(tag) =>
            setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])
          }
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLocations.map((location, index) => (
            <AssetCard
              key={location.id}
              location={location}
              tagOffset={index}
              onClick={() => {
                setSelectedLocation(location);
                setDrawerOpen(true);
              }}
              onEdit={() => {
                setEditingLocation(location);
                setLocationFormOpen(true);
              }}
              onDelete={() => void deleteLocation(location)}
            />
          ))}
        </section>
        {locations.length === 0 && !refreshing && <Card className="p-8 text-center text-sm text-muted-foreground">还没有资产数据，点击“新增资产位置”开始记录。</Card>}
      </div>

      <AssetDrawer
        open={drawerOpen}
        location={selectedLocation}
        store={store}
        onClose={() => setDrawerOpen(false)}
        onChanged={() => void loadDashboard()}
      />
      <LocationForm
        open={locationFormOpen}
        location={editingLocation}
        store={store}
        availableCurrencies={availableCurrencies}
        onClose={() => setLocationFormOpen(false)}
        onSaved={(location) => {
          setLocationFormOpen(false);
          setSelectedLocation(location);
          void loadDashboard();
        }}
      />
      <BackupDialog
        open={backupOpen}
        store={store}
        onClose={() => setBackupOpen(false)}
        onRestored={(result) => {
          if (result.rates) setRates(result.rates);
          void loadDashboard();
        }}
      />
    </main>
  );
}

function ModeChooser({ onChoose }: { onChoose: (mode: StoreMode) => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
            <WalletCards className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">个人资产看板</h1>
            <p className="text-sm text-muted-foreground">选择本次使用的数据空间</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="rounded-lg border border-border bg-card p-4 text-left transition hover:bg-muted" onClick={() => onChoose("online")}>
            <p className="font-medium">登录云端数据</p>
            <p className="mt-2 text-sm text-muted-foreground">连接 Cloudflare API，读取和保存云端资产。</p>
          </button>
          <button className="rounded-lg border border-border bg-card p-4 text-left transition hover:bg-muted" onClick={() => onChoose("offline")}>
            <p className="font-medium">使用本机离线数据</p>
            <p className="mt-2 text-sm text-muted-foreground">不登录，数据只保存在当前浏览器。</p>
          </button>
        </div>
      </Card>
    </main>
  );
}

function BackupDialog({ open, store, onClose, onRestored }: { open: boolean; store: DashboardStore | null; onClose: () => void; onRestored: (result: RestoreResult) => void }) {
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setBackup(null);
      setFileName("");
      setMessage("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  async function exportData() {
    setBusy(true);
    setError("");
    try {
      if (!store) throw new Error("store is not ready");
      const backup = await store.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `asset-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("备份文件已导出");
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file: File | undefined) {
    setBackup(null);
    setMessage("");
    setError("");
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      setBackup(parseBackup(parsed));
      setFileName(file.name);
    } catch {
      setError("无法识别该备份文件，请选择由本看板导出的 JSON 文件");
    }
  }

  async function restoreData() {
    if (!backup || !confirm("恢复会覆盖当前全部资产位置和历史记录，确定继续？")) return;
    setBusy(true);
    setError("");
    try {
      if (!store) throw new Error("store is not ready");
      const result = await store.restoreBackup(backup);
      setMessage(`恢复完成：${result.locations} 个资产位置，${result.history_records} 条金额记录`);
      setBackup(null);
      setFileName("");
      onRestored(result);
    } catch {
      setError("恢复失败，当前数据未被替换。请检查备份文件内容");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">数据备份与恢复</h2>
            <p className="mt-1 text-sm text-muted-foreground">JSON 格式，可直接阅读和程序解析</p>
          </div>
          <Button onClick={onClose} className="h-8 w-8 px-0" title="关闭"><X className="h-4 w-4" /></Button>
        </div>

        <div className="mt-5 grid gap-4">
          <section className="rounded-md border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">导出完整备份</p>
                <p className="mt-1 text-sm text-muted-foreground">包含资产位置、标签及全部金额快照</p>
              </div>
              <Button onClick={() => void exportData()} disabled={busy}><Download className="h-4 w-4" />导出</Button>
            </div>
          </section>

          <section className="rounded-md border border-border p-4">
            <p className="font-medium">从备份恢复</p>
            <p className="mt-1 text-sm text-muted-foreground">恢复时将覆盖看板中的现有数据</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted">
                <Upload className="h-4 w-4" />选择 JSON 文件
                <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0])} />
              </label>
              {backup && <Button onClick={() => void restoreData()} disabled={busy} className="border-rose-300 text-rose-600 dark:border-rose-900">确认覆盖并恢复</Button>}
            </div>
            {backup && (
              <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
                <p className="truncate font-medium">{fileName}</p>
                <p className="mt-1 text-muted-foreground">{backup.data.asset_locations.length} 个资产位置 · {backup.data.asset_history.length} 条金额记录 · 导出于 {formatDateTime(backup.exported_at)}</p>
              </div>
            )}
          </section>
        </div>
        {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
      </Card>
    </div>
  );
}

function Toolbar(props: {
  tags: string[];
  currencies: string[];
  selectedTags: string[];
  currencyFilter: string;
  sort: string;
  query: string;
  onQuery: (value: string) => void;
  onCurrency: (value: string) => void;
  onSort: (value: string) => void;
  onTag: (tag: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-panel">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_200px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Field value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="搜索资产位置" className="w-full pl-9" />
        </label>
        <Select value={props.currencyFilter} onChange={(event) => props.onCurrency(event.target.value)}>
          {props.currencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency === "ALL" ? "全部币种" : currency}
            </option>
          ))}
        </Select>
        <Select value={props.sort} onChange={(event) => props.onSort(event.target.value)}>
          <option value="created_at">按建立时间</option>
          <option value="current_amount">按现在金额</option>
          <option value="name">按名称</option>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.tags.map((tag) => {
          const active = props.selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => props.onTag(tag)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AssetCard({
  location,
  tagOffset,
  onClick,
  onEdit,
  onDelete
}: {
  location: AssetLocation;
  tagOffset: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="min-h-44 p-5">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <button onClick={onClick} className="min-w-0 text-left">
            <h3 className="text-lg font-semibold">{location.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">创建于 {formatDate(location.created_at)}</p>
          </button>
          <div className="flex items-center gap-1">
            <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
              {location.currency}
            </span>
            <Button className="h-8 w-8 px-0" onClick={onEdit} title="编辑资产位置">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button className="h-8 w-8 px-0 text-rose-500" onClick={onDelete} title="删除资产位置">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <button onClick={onClick} className="mt-6 text-left">
          <p className="text-sm text-muted-foreground">当前金额</p>
          <p className="mt-1 break-words text-2xl font-semibold">{formatMoney(location.current_amount, location.currency)}</p>
        </button>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {location.tags.map((tag, index) => (
            <Badge key={tag} className={tagColors[(tagOffset + index) % tagColors.length]}>
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}

function LocationForm({
  open,
  location,
  store,
  availableCurrencies,
  onClose,
  onSaved
}: {
  open: boolean;
  location: AssetLocation | null;
  store: DashboardStore | null;
  availableCurrencies: string[];
  onClose: () => void;
  onSaved: (location: AssetLocation) => void;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [initialAmount, setInitialAmount] = useState("0");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(location?.name || "");
    setCurrency(location?.currency || "CNY");
    setInitialAmount(String(location?.initial_amount ?? 0));
    setTags(location?.tags.join(", ") || "");
    setError("");
  }, [location, open]);

  if (!open) {
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      name,
      currency,
      initial_amount: Number(initialAmount),
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
    try {
      if (!store) throw new Error("store is not ready");
      const response = await store.saveLocation(location?.id || null, payload);
      onSaved(response.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  const currencyOptions = Array.from(new Set([...availableCurrencies, ...(location ? [location.currency] : [])]));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{location ? "编辑资产位置" : "新增资产位置"}</h2>
          <Button onClick={onClose} className="h-8 w-8 px-0" title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <Field value={name} onChange={(event) => setName(event.target.value)} placeholder="资产名称，如 招商银行卡" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={Boolean(location)}>
              {currencyOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Field
              type="number"
              step="0.01"
              value={initialAmount}
              onChange={(event) => setInitialAmount(event.target.value)}
              placeholder="起始金额"
            />
          </div>
          <Field value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用逗号分隔" />
          {location && <p className="text-xs text-muted-foreground">资产创建后货币类型保持固定，避免历史记录跨币种混算。</p>}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
            保存
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AssetDrawer({ open, location, store, onClose, onChanged }: { open: boolean; location: AssetLocation | null; store: DashboardStore | null; onClose: () => void; onChanged: () => void }) {
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [detailError, setDetailError] = useState("");
  const [range, setRange] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AssetHistory | null>(null);
  const [recordAmount, setRecordAmount] = useState("");
  const [note, setNote] = useState("");
  const [snapshotTime, setSnapshotTime] = useState(toDateTimeLocal(new Date().toISOString()));
  const [detailVersion, setDetailVersion] = useState(0);

  useEffect(() => {
    if (!location || !open || !store) {
      return;
    }
    const currentStore = store;
    async function loadDetails() {
      if (!location) {
        return;
      }
      try {
        const details = await currentStore.loadLocationDetails(location.id, range);
        setHistory(details.history);
        setTrend(details.trend);
        setDetailError("");
      } catch (error) {
        setHistory([]);
        setTrend([]);
        setDetailError(error instanceof Error ? error.message : "历史数据读取失败");
      }
    }
    void loadDetails();
  }, [location, open, range, detailVersion, store]);

  if (!open || !location) {
    return null;
  }

  async function submitRecord(event: FormEvent) {
    event.preventDefault();
    if (!location || !recordAmount) {
      return;
    }
    try {
      const payload = {
        final_amount: Number(recordAmount),
        snapshot_time: new Date(snapshotTime).toISOString(),
        note
      };
      if (editingRecord) {
        if (!store) throw new Error("store is not ready");
        await store.saveHistory(location.id, editingRecord.id, payload);
      } else {
        if (!store) throw new Error("store is not ready");
        await store.saveHistory(location.id, null, payload);
      }
      setRecordAmount("");
      setNote("");
      setSnapshotTime(toDateTimeLocal(new Date().toISOString()));
      setEditingRecord(null);
      setShowForm(false);
      onChanged();
      setDetailVersion((value) => value + 1);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function deleteRecord(record: AssetHistory) {
    if (!confirm("删除这条金额记录？")) {
      return;
    }
    try {
      if (!store) throw new Error("store is not ready");
      await store.deleteHistory(record.id);
      onChanged();
      setDetailVersion((value) => value + 1);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "删除失败");
    }
  }

  function startEditRecord(record: AssetHistory) {
    setEditingRecord(record);
    setRecordAmount(String(record.final_amount));
    setNote(record.note || "");
    setSnapshotTime(toDateTimeLocal(record.snapshot_time));
    setShowForm(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-sm">
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{location.currency}</p>
            <h2 className="mt-1 text-2xl font-semibold">{location.name}</h2>
            <p className="mt-2 text-3xl font-semibold">{formatMoney(location.current_amount, location.currency)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setEditingRecord(null);
                setRecordAmount("");
                setNote("");
                setSnapshotTime(toDateTimeLocal(new Date().toISOString()));
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              新增记录
            </Button>
            <Button onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {detailError && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{detailError}</p>}

        {showForm && (
          <form onSubmit={submitRecord} className="mt-5 grid gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{editingRecord ? "编辑金额快照" : "新增金额快照"}</p>
              <Button
                type="button"
                className="h-8 px-2"
                onClick={() => {
                  setShowForm(false);
                  setEditingRecord(null);
                  setRecordAmount("");
                  setNote("");
                  setSnapshotTime(toDateTimeLocal(new Date().toISOString()));
                }}
              >
                取消
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Field type="number" step="0.01" value={recordAmount} onChange={(event) => setRecordAmount(event.target.value)} placeholder="当前金额" />
              <Field type="datetime-local" value={snapshotTime} onChange={(event) => setSnapshotTime(event.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">这里填写该时间点的资产总余额；变动金额会根据上一条记录自动计算。</p>
            <Field value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" />
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              保存
            </Button>
          </form>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            ["all", "建立以来"],
            ["1y", "近一年"],
            ["6m", "近半年"],
            ["1m", "近一月"],
            ["1w", "近一周"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={cn(
                "h-8 rounded-md border px-3 text-sm transition",
                range === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Card className="mt-4 p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
                <XAxis dataKey="date" tickFormatter={formatDate} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}万`} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTooltip currency={location.currency} />} />
                <Line type="monotone" dataKey="value_cny" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <section className="mt-6">
          <h3 className="text-base font-semibold">历史记录</h3>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {history.map((item) => {
              const positive = item.change_amount >= 0;
              return (
                <div key={item.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm text-muted-foreground">{formatDateTime(item.snapshot_time)}</p>
                    <p className="mt-1 text-sm">{item.note || "无备注"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">变动后 {formatMoney(item.final_amount, location.currency)}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3 sm:flex-col sm:items-end">
                    <p className={cn("text-lg font-semibold", positive ? "text-emerald-500" : "text-rose-500")}>
                      {positive ? "+" : ""}
                      {formatMoney(item.change_amount, location.currency)}
                    </p>
                    <div className="flex gap-1">
                      <Button className="h-8 w-8 px-0" onClick={() => startEditRecord(item)} title="编辑记录">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button className="h-8 w-8 px-0 text-rose-500" onClick={() => void deleteRecord(item)} title="删除记录">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function EventDot(props: { cx?: number; cy?: number; payload?: TrendPoint }) {
  if (!props.cx || !props.cy || props.payload?.source !== "event") {
    return <g />;
  }
  return <circle cx={props.cx} cy={props.cy} r={4} fill="hsl(var(--card))" stroke="#0d9488" strokeWidth={2} />;
}

function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ value: number; payload: TrendPoint }>; label?: string; currency: string }) {
  if (!active || !payload?.length) {
    return null;
  }
  const item = payload[0];
  return (
    <div className="glass-tooltip p-3">
      <p className="text-xs text-muted-foreground">{label ? formatDateTime(label) : ""}</p>
      <p className="mt-1 text-sm font-semibold">{formatMoney(Number(item.value), currency)}</p>
      {item.payload.source === "event" && <p className="mt-1 text-xs text-primary">记录点 · {item.payload.record_count || 1} 条</p>}
    </div>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
