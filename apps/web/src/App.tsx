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
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Tags,
  WalletCards,
  X
} from "lucide-react";
import { api, mockHistory, mockLocationTrend, mockLocations, mockSummary, type AssetHistory, type AssetLocation, type Summary, type TrendPoint } from "./lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "./lib/utils";
import { Badge, Button, Card, Field, Select } from "./components/ui";

type SortKey = "created_at" | "current_amount" | "name";

const tagColors = [
  "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
];

export function App() {
  const [dark, setDark] = useState(false);
  const [summary, setSummary] = useState<Summary>(mockSummary);
  const [locations, setLocations] = useState<AssetLocation[]>(mockLocations);
  const [selectedCurrency, setSelectedCurrency] = useState("CNY");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<AssetLocation | null>(mockLocations[0]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMock, setIsMock] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    void loadDashboard();
  }, [selectedTags, currencyFilter, sort]);

  async function loadDashboard() {
    setRefreshing(true);
    const params = new URLSearchParams({ sort, order: sort === "name" ? "asc" : "desc" });
    selectedTags.forEach((tag) => params.append("tag", tag));
    if (currencyFilter !== "ALL") {
      params.set("currency", currencyFilter);
    }
    try {
      const [nextSummary, nextLocations] = await Promise.all([api.summary(), api.locations(params)]);
      setSummary(nextSummary);
      setLocations(nextLocations.items);
      setIsMock(false);
      if (!nextSummary.currencies.includes(selectedCurrency)) {
        setSelectedCurrency("CNY");
      }
    } catch {
      setSummary(mockSummary);
      setLocations(mockLocations);
      setIsMock(true);
    } finally {
      setRefreshing(false);
    }
  }

  const allTags = useMemo(() => Array.from(new Set(locations.flatMap((item) => item.tags))).sort(), [locations]);
  const currencies = useMemo(() => Array.from(new Set(["ALL", ...summary.currencies, ...locations.map((item) => item.currency)])), [locations, summary]);
  const filteredLocations = useMemo(() => {
    return locations.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  }, [locations, query]);

  const totalDisplay = summary.totals[selectedCurrency] ?? summary.total_cny;
  const totalChange = summary.trend.length > 1 ? summary.total_cny - summary.trend[0].value_cny : 0;

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
                汇率更新 {summary.exchange_rates_updated_at}
                {isMock ? " · 演示数据" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void loadDashboard()} disabled={refreshing} title="刷新">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              刷新
            </Button>
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
                    {formatMoney(totalDisplay, selectedCurrency)}
                  </strong>
                  <Select value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value)}>
                    {summary.currencies.map((currency) => (
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
              <Button onClick={() => setDrawerOpen(true)}>
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
            />
          ))}
        </section>
      </div>

      <AssetDrawer
        open={drawerOpen}
        location={selectedLocation}
        isMock={isMock}
        onClose={() => setDrawerOpen(false)}
        onChanged={() => void loadDashboard()}
      />
    </main>
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

function AssetCard({ location, tagOffset, onClick }: { location: AssetLocation; tagOffset: number; onClick: () => void }) {
  return (
    <Card>
      <button onClick={onClick} className="flex min-h-44 w-full flex-col items-stretch p-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{location.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">创建于 {formatDate(location.created_at)}</p>
          </div>
          <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
            {location.currency}
          </span>
        </div>
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">当前金额</p>
          <p className="mt-1 break-words text-2xl font-semibold">{formatMoney(location.current_amount, location.currency)}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {location.tags.map((tag, index) => (
            <Badge key={tag} className={tagColors[(tagOffset + index) % tagColors.length]}>
              {tag}
            </Badge>
          ))}
        </div>
      </button>
    </Card>
  );
}

function AssetDrawer({ open, location, isMock, onClose, onChanged }: { open: boolean; location: AssetLocation | null; isMock: boolean; onClose: () => void; onChanged: () => void }) {
  const [history, setHistory] = useState<AssetHistory[]>(mockHistory);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [range, setRange] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [changeAmount, setChangeAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!location || !open) {
      return;
    }
    async function loadDetails() {
      if (!location) {
        return;
      }
      try {
        const [nextHistory, nextTrend] = await Promise.all([api.history(location.id), api.trend(location.id, range)]);
        setHistory(nextHistory.items);
        setTrend(nextTrend.trend);
      } catch {
        setHistory(mockHistory.filter((item) => item.location_id === location.id || location.id === "loc_1"));
        setTrend(mockLocationTrend(location));
      }
    }
    void loadDetails();
  }, [location, open, range]);

  if (!open || !location) {
    return null;
  }

  async function submitRecord(event: FormEvent) {
    event.preventDefault();
    if (!location || !changeAmount) {
      return;
    }
    try {
      await api.createHistory(location.id, {
        change_amount: Number(changeAmount),
        note
      });
      setChangeAmount("");
      setNote("");
      setShowForm(false);
      onChanged();
    } catch {
      setHistory((current) => [
        {
          id: crypto.randomUUID(),
          location_id: location.id,
          change_amount: Number(changeAmount),
          final_amount: location.current_amount + Number(changeAmount),
          snapshot_time: new Date().toISOString(),
          note
        },
        ...current
      ]);
      setShowForm(false);
    }
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
            <Button onClick={() => setShowForm((value) => !value)}>
              <Plus className="h-4 w-4" />
              新增记录
            </Button>
            <Button onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isMock && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">当前展示演示数据，启动 API 后会自动读取真实记录。</p>}

        {showForm && (
          <form onSubmit={submitRecord} className="mt-5 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field type="number" step="0.01" value={changeAmount} onChange={(event) => setChangeAmount(event.target.value)} placeholder="变动金额" />
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
                  <p className={cn("text-lg font-semibold", positive ? "text-emerald-500" : "text-rose-500")}>
                    {positive ? "+" : ""}
                    {formatMoney(item.change_amount, location.currency)}
                  </p>
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
