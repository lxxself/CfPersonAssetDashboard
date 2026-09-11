# API app

Cloudflare Workers API for the Personal Asset Dashboard.

## Bindings

Configured in [wrangler.toml](wrangler.toml):

- `DB`: Cloudflare D1 database for asset locations and history.
- `ASSET_KV`: Cloudflare KV namespace for the exchange-rate cache.
- `EXCHANGE_RATE_API_URL`: optional non-secret URL; defaults to `https://open.er-api.com/v6/latest/CNY`.
- `DASHBOARD_PASSWORD`: Worker secret used for the single-user password gate.

Create your own D1 database and KV namespace, then replace the resource IDs in `wrangler.toml` before remote deployment. Keep the binding names `DB` and `ASSET_KV`. Never put `DASHBOARD_PASSWORD` in this file.

## Endpoints

```text
GET    /api/health
GET    /api/exchange-rates
POST   /api/exchange-rates/refresh

GET    /api/asset-locations?tag=现金&currency=CNY&sort=current_amount&order=desc
POST   /api/asset-locations
GET    /api/asset-locations/:id
PATCH  /api/asset-locations/:id
DELETE /api/asset-locations/:id

GET    /api/asset-locations/:id/history?from=2026-01-01&to=2026-12-31
POST   /api/asset-locations/:id/history
PATCH  /api/asset-history/:id
DELETE /api/asset-history/:id

GET    /api/asset-locations/:id/trend?range=all|1y|6m|1m|1w
GET    /api/summary
GET    /api/backup
POST   /api/backup/restore
```

`GET /api/health` and the read-only `GET /api/exchange-rates` route are public. When `DASHBOARD_PASSWORD` is set, every other API route requires `Authorization: Bearer <password>`.

## Local development

From the repository root:

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm --workspace apps/api run db:migrate:local
npm run dev:api
```

Use a second terminal for the frontend:

```bash
npm run dev:web
```

Test the manual exchange-rate sync locally:

```bash
curl -X POST http://localhost:8787/api/exchange-rates/refresh
```

## Deploy

For a guided API deployment, use the button in the [root README](../../README.md). It targets this isolated Worker directory; the Pages frontend is still deployed separately.

```bash
npx wrangler login
npx wrangler d1 create personal-asset-dashboard
npx wrangler kv namespace create ASSET_KV
```

Copy the returned D1 and KV IDs into [wrangler.toml](wrangler.toml), then deploy:

```bash
npm run deploy:api
npx wrangler secret put DASHBOARD_PASSWORD --config apps/api/wrangler.toml
```

The deploy script applies pending remote migrations through the `DB` binding before publishing the Worker. The migration command is intentionally binding-based so it also works when the database is renamed during a button deployment.

The secret command deploys the new secret version immediately. Keep `crons = []`; exchange rates are refreshed manually from the UI.
