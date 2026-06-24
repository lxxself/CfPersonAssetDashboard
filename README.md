# Personal Asset Dashboard

现代、简洁的个人资产记录服务看板。默认货币为人民币（CNY），后端运行在 Cloudflare Workers，数据使用 D1，汇率缓存使用 KV，前端计划部署到 Cloudflare Pages。

## Project Structure

```text
CfPersonalAssetDashboard/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── exchange.ts
│   │   │   ├── index.ts
│   │   │   ├── routes.ts
│   │   │   ├── trends.ts
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   ├── migrations/
│   │   │   └── 0001_initial.sql
│   │   ├── README.md
│   │   ├── schema.sql
│   │   ├── tsconfig.json
│   │   └── wrangler.toml
│   └── web/
│       └── README.md
├── docs/
│   └── kv-design.md
└── README.md
```

## Step 1: Database And KV Design

- D1 schema: [apps/api/schema.sql](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/schema.sql)
- D1 migration: [apps/api/migrations/0001_initial.sql](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/migrations/0001_initial.sql)
- KV design: [docs/kv-design.md](/Users/lxx/Documents/CfPersonalAssetDashboard/docs/kv-design.md)

## Design Notes

- 默认记账币种为 `CNY`。
- `asset_locations.current_amount` 存储该资产位置原币种下的当前余额。
- `asset_history.change_amount` 与 `final_amount` 同样使用该资产位置原币种。
- 汇率 KV 以 `CNY` 为基准，即 `1 CNY = rates[CODE] CODE`。
- 将外币折算为人民币时使用：`amount / rates[CODE]`。
- 将人民币展示为其他币种时使用：`amount * rates[CODE]`。

## Step 2: Workers API

The Workers API is implemented with Hono in [apps/api/src/routes.ts](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/src/routes.ts).

Core endpoints:

```text
GET    /api/health
GET    /api/exchange-rates
POST   /api/exchange-rates/refresh
GET    /api/asset-locations
POST   /api/asset-locations
GET    /api/asset-locations/:id
PATCH  /api/asset-locations/:id
DELETE /api/asset-locations/:id
GET    /api/asset-locations/:id/history
POST   /api/asset-locations/:id/history
DELETE /api/asset-history/:id
GET    /api/asset-locations/:id/trend
GET    /api/summary
```

The scheduled handler in [apps/api/src/index.ts](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/src/index.ts) refreshes `exchange_rates` once per day. The summary endpoint converts all assets to CNY with the cached rates and returns a filled trend series for sparse, low-frequency records.

## Local Development

```bash
npm install
npm run typecheck
npm --workspace apps/api run db:migrate:local
npm run dev:api
```

Trigger the cron handler locally:

```bash
curl http://localhost:8787/__scheduled
```

## Deployment

Create Cloudflare resources:

```bash
npx wrangler d1 create personal-asset-dashboard
npx wrangler kv namespace create ASSET_KV
```

Copy the returned IDs into [apps/api/wrangler.toml](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/wrangler.toml), then run:

```bash
npm --workspace apps/api run db:migrate:remote
npm run deploy:api
```

## Current Cloudflare Deployment

- API Worker: `https://personal-asset-dashboard-api.xxl.workers.dev`
- D1 database: `personal-asset-dashboard`
- KV namespace: `personal-asset-dashboard-kv`
- Pages project: `personal-asset-dashboard`
- Pages domain: `https://personal-asset-dashboard.pages.dev`

The API Worker, D1 schema, KV binding, and daily cron schedule are deployed. The web app builds successfully to [apps/web/dist](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/web/dist), but the Pages deployment upload still needs to be completed once local Wrangler can access its `@esbuild/darwin-arm64` optional dependency or a Git remote is connected.
