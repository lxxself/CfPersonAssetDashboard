# API App

Cloudflare Workers API for the Personal Asset Dashboard.

## Bindings

Configured in [wrangler.toml](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/wrangler.toml):

- `DB`: Cloudflare D1 database.
- `ASSET_KV`: Cloudflare KV namespace.
- `EXCHANGE_RATE_API_URL`: defaults to `https://open.er-api.com/v6/latest/CNY`.

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
DELETE /api/asset-history/:id

GET    /api/asset-locations/:id/trend?range=all|1y|6m|1m|1w
GET    /api/summary
```

## Local Development

```bash
npm install
npm run dev:api
```

Apply D1 migrations locally:

```bash
npm --workspace apps/api run db:migrate:local
```

Test scheduled jobs locally:

```bash
npm run dev:api
curl http://localhost:8787/__scheduled
```

## Deploy

1. Create resources:

```bash
npx wrangler d1 create personal-asset-dashboard
npx wrangler kv namespace create ASSET_KV
```

2. Copy the returned IDs into [wrangler.toml](/Users/lxx/Documents/CfPersonalAssetDashboard/apps/api/wrangler.toml).

3. Apply remote D1 migrations:

```bash
npm --workspace apps/api run db:migrate:remote
```

4. Deploy:

```bash
npm run deploy:api
```
