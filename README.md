# Personal Asset Dashboard

A self-hosted personal asset dashboard for recording balances, tracking historical snapshots, viewing multi-currency totals, and exporting backups.

[中文文档](README.zh-CN.md)

[![Deploy API to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lxxself/CfPersonAssetDashboard/tree/main/apps/api)

The button deploys the API Worker and its D1/KV resources to your Cloudflare account. The Pages frontend is configured separately below.

The application is designed to run in your own Cloudflare account:

- React + Vite frontend on Cloudflare Pages
- Hono API on Cloudflare Workers
- D1 for asset locations and history
- KV for cached exchange rates
- Manual exchange-rate refresh through the dashboard

The UI is currently in Simplified Chinese. The repository does not contain a production dataset; the frontend only includes synthetic demo data for offline/error fallback.

## Architecture

```text
Browser
  ├── Cloudflare Pages (static React app)
  └── Cloudflare Worker API
        ├── D1: asset locations and balance history
        ├── KV: exchange-rate cache
        └── Exchange-rate provider (only when manual sync is requested)
```

## Features

- Record asset locations in CNY or another three-letter currency.
- Add balance snapshots and inspect per-account or total trends.
- Filter by currency and tags.
- Manually refresh exchange rates; there is no scheduled Cron job.
- Export a complete JSON backup and restore it later.
- Protect API routes with a single-user Worker secret.
- Run locally with Wrangler's local D1/KV emulation.

## Repository layout

```text
apps/api/       Cloudflare Worker API, D1 schema, migrations, and Wrangler config
apps/web/       React/Vite frontend
docs/           Storage and data-model notes
```

Useful files:

- [API routes](apps/api/src/routes.ts)
- [D1 schema](apps/api/schema.sql)
- [Initial migration](apps/api/migrations/0001_initial.sql)
- [KV design](docs/kv-design.md)
- [Worker configuration](apps/api/wrangler.toml)

## Requirements

- Node.js 22.12 or newer
- An active Cloudflare account for deployment
- Wrangler authentication via `npx wrangler login`

## Local development

Install dependencies from the repository root:

```bash
npm install
```

For local API authentication, copy the example and choose a local password:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Apply the D1 migration to Wrangler's local database:

```bash
npm --workspace apps/api run db:migrate:local
```

Start the API and frontend in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`. The local frontend defaults to `http://localhost:8787` for the API. If you use another API origin, set it before starting Vite:

```bash
VITE_API_BASE=http://localhost:8787 npm run dev:web
```

When `DASHBOARD_PASSWORD` is absent, the API intentionally allows unauthenticated local requests. Never expose such a Worker to the public internet.

## Deploy the API to your Cloudflare account

Deploy the API first. You will need its final Worker URL when building Pages.

### One-click API deployment

Use the **Deploy API to Cloudflare** button at the top of this page. It opens Cloudflare's deployment flow for the isolated `apps/api` Worker, provisions the D1 and KV resources described by the Wrangler configuration, applies the D1 migrations, and deploys the Worker to your account.

This button is intentionally API-only: Cloudflare Deploy buttons support Workers, not Pages, and this repository contains two deployable applications. After the Worker deployment completes:

1. If the setup page asks for `DASHBOARD_PASSWORD`, enter a strong unique value; otherwise set the Worker secret immediately in the Cloudflare dashboard or with the `wrangler secret put` command below.
2. Copy the Worker URL into the Pages `VITE_API_BASE` setting.
3. Follow the Pages deployment instructions in the next section.

The button is available after these changes are pushed to the public GitHub repository. If you prefer to review every command locally, use the manual flow below.

### 1. Authenticate Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

### 2. Create D1 and KV resources

The commands below use the binding names expected by the application. You can choose any resource names in Cloudflare; keep the bindings `DB` and `ASSET_KV` in the Wrangler config.

```bash
npx wrangler d1 create personal-asset-dashboard
npx wrangler kv namespace create ASSET_KV
```

Copy the returned D1 `database_id` and KV namespace `id` into [apps/api/wrangler.toml](apps/api/wrangler.toml). Replace the Worker `name` if it is already used in your account.

The IDs in the Wrangler file are account-scoped resource identifiers, not passwords or API tokens. They must still be replaced with resources from your own account before deploying.

### 3. Apply the remote migration and deploy

```bash
npm run deploy:api
```

`npm run deploy:api` applies pending remote migrations through the `DB` binding and then deploys the Worker. Running the migration command separately is optional; it is kept available for troubleshooting and explicit migration checks.

The deployment output contains the Worker URL, for example `https://<your-worker>.<your-subdomain>.workers.dev`.

### 4. Set the production password immediately

Use a long, unique password. Wrangler prompts for the value so it does not appear in shell history:

```bash
npx wrangler secret put DASHBOARD_PASSWORD --config apps/api/wrangler.toml
```

`DASHBOARD_PASSWORD` is a Worker secret. Do not put it in `vars`, source code, a Pages variable, or a committed `.env` file. `wrangler secret put` deploys the new secret version immediately.

Verify that the public health check works and a protected endpoint requires authentication:

```bash
curl https://<your-worker>.<your-subdomain>.workers.dev/api/health
curl -i https://<your-worker>.<your-subdomain>.workers.dev/api/summary
```

The second command should return `401` until an `Authorization: Bearer ...` header is supplied. Do not put a real password in a command copied into issue reports or shell history.

Keep `[triggers]` with `crons = []` in the Wrangler config. This application refreshes exchange rates only when the user clicks **Manual Sync**.

## Deploy the frontend to Cloudflare Pages

The frontend and API are separate deployments. `VITE_API_BASE` is a public build-time setting, not a secret, and must point to your own Worker origin.

### Recommended: Pages Git integration

In Cloudflare **Workers & Pages**, create a Pages project and connect this repository. For this monorepo use:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `npm run build:web` |
| Build output directory | `apps/web/dist` |
| Production branch | your production branch, usually `main` |
| `VITE_API_BASE` | `https://<your-worker>.<your-subdomain>.workers.dev` |

Set `VITE_API_BASE` for both Production and Preview environments before the first build. Vite embeds it into the generated JavaScript, so changing it requires a new Pages deployment.

### Direct Wrangler upload

If you do not use Git integration, build from the repository root with your API origin and upload the generated directory:

```bash
VITE_API_BASE=https://<your-worker>.<your-subdomain>.workers.dev npm run build:web
npx wrangler pages project create <your-pages-project> --production-branch=main
npx wrangler pages deploy apps/web/dist --project-name <your-pages-project>
```

Do not put `DASHBOARD_PASSWORD` in the Pages environment. The browser asks for the password and sends it to your Worker as a Bearer token.

## Build and verification commands

```bash
npm run typecheck
npm run build:web
npm run preview:web
```

Before using the dashboard, confirm:

1. `/api/health` returns `200`.
2. A protected API endpoint returns `401` without the password.
3. Pages is built with your Worker URL in `VITE_API_BASE`.
4. You can log in, add a test asset, refresh exchange rates, export a backup, and restore it.

## API overview

When `DASHBOARD_PASSWORD` is configured, all routes except `GET /api/health` and CORS preflight require authentication.

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
PATCH  /api/asset-history/:id
DELETE /api/asset-history/:id
GET    /api/asset-locations/:id/trend
GET    /api/summary
GET    /api/backup
POST   /api/backup/restore
```

## Privacy and security notes

- The repository has no committed `.env`, `.dev.vars`, backup, API-key, token, or private-key file.
- Production asset records live in your D1 database and exchange-rate cache in your KV namespace; they are not sent to the frontend build system.
- Manual exchange-rate refresh calls the configured exchange-rate provider. It sends a currency-rate request, not asset names, balances, tags, or history.
- JSON backups contain all asset names, amounts, tags, notes, and history. Treat them like financial records and do not commit them.
- The frontend stores the entered password in browser `localStorage` and sends it as a Bearer token over HTTPS. Use a private, trusted browser profile.
- This is a small single-user self-hosted tool. The password gate is not a replacement for Cloudflare Access, stronger identity management, rate limiting, or a full financial-data security review.
- If the password is missing, the API is intentionally open for local development. Set the Worker secret before entering real data.
- If a real credential was ever committed, rotate it first; deleting it in a later commit does not remove it from Git history.
- Worker observability is enabled in the sample configuration. Review Cloudflare's telemetry and retention settings if request metadata is sensitive.

## Backup and restore

Use **Data Backup** in the dashboard to download a versioned JSON file. Restore replaces all asset locations and history records, so export the current data first and keep more than one backup copy.

## Cloudflare documentation

- [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Create a KV namespace](https://developers.cloudflare.com/kv/get-started/)
