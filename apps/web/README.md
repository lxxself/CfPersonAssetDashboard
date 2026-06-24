# Web App

Cloudflare Pages frontend for the Personal Asset Dashboard.

## Stack

- Vite + React
- Tailwind CSS
- Shadcn UI style primitives
- Recharts
- Lucide icons

## Development

```bash
npm install
npm run dev:web
```

The app reads `VITE_API_BASE` when present. Without it, API calls default to `http://localhost:8787`.

```bash
VITE_API_BASE=http://localhost:8787 npm run dev:web
```

## Build

```bash
npm run build:web
```
