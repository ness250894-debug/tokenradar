const VERSION = "tokenradar-pwa-v2";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const DATA_CACHE = `${VERSION}-data`;

const APP_SHELL_URLS = [
  "/",
  "/tokens",
  "/tokens.html",
  "/watchlist",
  "/watchlist.html",
  "/upcoming",
  "/upcoming.html",
  "/learn",
  "/learn.html",
  "/about",
  "/about.html",
  "/privacy",
  "/privacy.html",
  "/terms",
  "/terms.html",
  "/offline",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches());
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "TOKENRADAR_CACHE_WATCHLIST") return;
  event.waitUntil(cacheSavedTokenResearch(event.data.tokenIds));
});

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);
  await cacheUrls(cache, APP_SHELL_URLS);
}

async function removeOldCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith("tokenradar-pwa-") && !cacheName.startsWith(VERSION))
      .map((cacheName) => caches.delete(cacheName))
  );
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const pathname = new URL(request.url).pathname;
    return (
      (await caches.match(request)) ||
      (await caches.match(pathname)) ||
      (await caches.match(toHtmlFallbackPath(pathname))) ||
      (await caches.match("/offline")) ||
      (await caches.match("/offline.html")) ||
      new Response("TokenRadar is offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    );
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("No cached response available.");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheSavedTokenResearch(tokenIds) {
  const savedIds = Array.isArray(tokenIds)
    ? tokenIds
        .map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))
        .filter((id) => /^[a-z0-9-]{1,96}$/.test(id))
    : [];

  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const dataCache = await caches.open(DATA_CACHE);

  const tokenUrls = savedIds.flatMap((id) => [`/${id}`, `/${id}.html`]);
  await Promise.all([
    cacheUrls(runtimeCache, ["/watchlist", "/watchlist.html", "/tokens", "/tokens.html", ...tokenUrls]),
    cacheUrls(dataCache, [
      "/data/_registry.json",
      "/data/_tokens_blob.json",
      "/data/_metrics_blob.json",
      "/data/_prices_blob.json",
      "/data/tokens.json"
    ])
  ]);
}

async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch {
        // Optional cache targets should not block install or watchlist updates.
      }
    })
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf)$/i.test(url.pathname)
  );
}

function isDataRequest(url) {
  return url.pathname.startsWith("/data/") || url.pathname.endsWith(".json");
}

function toHtmlFallbackPath(pathname) {
  if (pathname === "/" || pathname.endsWith(".html")) return pathname;
  return `${pathname.replace(/\/$/, "")}.html`;
}
