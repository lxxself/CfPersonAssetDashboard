import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function pwaServiceWorker(): Plugin {
  return {
    name: "asset-dashboard-pwa-service-worker",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).map((fileName) => `/${fileName}`);
      const precache = Array.from(new Set(["/", "/index.html", "/manifest.webmanifest", ...assets]));
      const source = `
const CACHE_PREFIX = "asset-dashboard-shell-";
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(Date.now().toString())};
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.headers.has("authorization")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    }
  };
}

export default defineConfig({
  plugins: [react(), pwaServiceWorker()],
  server: {
    port: 5173
  }
});
