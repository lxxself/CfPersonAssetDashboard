import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  get length() {
    return this.values.size;
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const { LocalStore } = await import("../../../apps/web/src/lib/local-store.ts");
const { StoreError } = await import("../../../apps/web/src/lib/store.ts");

const rates = {
  base: "CNY",
  rates: { CNY: 1, USD: 7.2 },
  updated_at: "2026-09-10"
};

test("local store starts empty, persists CRUD, filters data, and rejects corrupted storage", async () => {
  storage.clear();
  const store = new LocalStore(rates);
  const empty = await store.loadDashboard(new URLSearchParams({ sort: "created_at", order: "desc" }));
  assert.deepEqual(empty.locations, []);
  assert.equal(empty.summary.total_cny, 0);

  const cash = await store.saveLocation(null, {
    name: "现金",
    currency: "CNY",
    initial_amount: 100,
    tags: ["现金"]
  });
  const usd = await store.saveLocation(null, {
    name: "美元账户",
    currency: "USD",
    initial_amount: 72,
    tags: ["投资"]
  });
  await assert.rejects(
    store.saveLocation(null, { name: "欧元账户", currency: "EUR", initial_amount: 10, tags: [] }),
    (error) => error instanceof StoreError && /本地汇率/.test(error.message)
  );
  const sorted = await store.loadDashboard(new URLSearchParams({ sort: "current_amount", order: "desc" }));
  assert.deepEqual(sorted.locations.map((item) => item.id), [cash.item.id, usd.item.id]);

  const first = await store.saveHistory(cash.item.id, null, {
    final_amount: 120,
    snapshot_time: "2026-01-15T00:00:00.000Z",
    note: "入账"
  });
  const second = await store.saveHistory(cash.item.id, null, {
    final_amount: 90,
    snapshot_time: "2026-02-15T00:00:00.000Z",
    note: "支出"
  });
  assert.equal(second.item.change_amount, -30);

  const edited = await store.saveHistory(cash.item.id, first.item.id, {
    final_amount: 130,
    snapshot_time: "2026-01-15T00:00:00.000Z",
    note: "修正"
  });
  assert.equal(edited.item.change_amount, 30);
  const details = await store.loadLocationDetails(cash.item.id, "all");
  assert.equal(details.history.find((item) => item.id === second.item.id)?.change_amount, -40);

  const filtered = await store.loadDashboard(new URLSearchParams({ currency: "USD", tag: "投资" }));
  assert.deepEqual(filtered.locations.map((item) => item.id), [usd.item.id]);

  await store.deleteHistory(first.item.id);
  const afterDelete = await store.loadLocationDetails(cash.item.id, "all");
  assert.equal(afterDelete.history[0].change_amount, -10);

  const backup = await store.exportBackup();
  assert.equal(backup.version, 1);
  assert.equal(backup.exchange_rates?.rates.USD, 7.2);

  storage.setItem("asset-dashboard-offline-v1", "not-json");
  const corrupted = new LocalStore(rates);
  await assert.rejects(corrupted.loadDashboard(new URLSearchParams()), StoreError);

  await corrupted.restoreBackup(backup);
  const recovered = await corrupted.loadDashboard(new URLSearchParams());
  assert.equal(recovered.locations.length, 2);
  const persisted = await new LocalStore(rates).loadDashboard(new URLSearchParams());
  assert.equal(persisted.locations.length, 2);
  assert.equal(persisted.summary.total_cny, 100);
});
