# Web app

React/Vite frontend for the Personal Asset Dashboard, intended for Cloudflare Pages.

The app provides two independent data spaces: authenticated cloud data from the Worker API and browser-local offline data stored in plaintext `localStorage`. The first visit asks which space to use and later remembers the last choice. The production build also emits a Service Worker and PWA manifest; it caches only the static shell, never API responses. Full offline reopening requires one successful online visit first so the shell can be cached.

## Development

From the repository root:

```bash
npm install
npm run dev:web
```

In development, API requests default to `http://localhost:8787`. To use another API origin, set `VITE_API_BASE` before starting Vite:

```bash
VITE_API_BASE=http://localhost:8787 npm run dev:web
```

You can copy [`.env.example`](.env.example) to `.env.local` for local configuration. `VITE_API_BASE` is public configuration, not a secret.

## Build

```bash
npm run build:web
npm run preview:web
```

For a separate Cloudflare Pages and Worker deployment, set `VITE_API_BASE` to your own Worker origin in the Pages project's Production and Preview environment variables. The value is embedded during the build, so changing it requires a new deployment. The Pages settings for this monorepo are:

```text
Root directory: /
Build command: npm run build:web
Build output directory: apps/web/dist
```

Do not put `DASHBOARD_PASSWORD` in Pages variables. It belongs only in the API Worker's secret store.
