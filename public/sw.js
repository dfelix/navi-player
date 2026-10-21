// NaviPlayer's service worker: makes the installed app open offline and keeps
// album art around between visits.
//
//   page loads       network first; the saved page when offline
//   /assets/*        from the cache once fetched (file names change per build)
//   cover art        shown from the cache at once, refreshed behind it, and
//                    kept under a size budget the app sets
//   everything else  untouched: API calls and audio go straight to the network
//
// Plain JavaScript outside the build, so names shared with the app are
// repeated here (see src/lib/swCaches.ts).

const SHELL_CACHE = "navi-player-shell-v2";
const ASSET_CACHE = "navi-player-assets-v2";
const ART_CACHE = "navi-player-art-v1";
const CACHES = [SHELL_CACHE, ASSET_CACHE, ART_CACHE];

// Old builds' assets are never asked for again; keep only this many.
const MAX_ASSETS = 80;
// Until the app says otherwise (Settings → Performance).
let artBudget = 150 * 1024 * 1024;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(["/", "/manifest.webmanifest"]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (!CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// The app tells the worker its art budget; workers can't read localStorage.
self.addEventListener("message", (event) => {
  const { type, megabytes } = event.data ?? {};
  const mb = Number(megabytes);
  if (type !== "art-budget" || !(mb > 0)) return;
  artBudget = mb * 1024 * 1024;
  trimArtSoon();
});

// ---- Strategies ----

async function pageLoad(request) {
  try {
    const page = await fetch(request);
    if (page.ok) {
      const copy = page.clone();
      void caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
    }
    return page;
  } catch {
    return (await caches.match("/", { cacheName: SHELL_CACHE })) ?? Response.error();
  }
}

async function buildAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const fresh = await fetch(request);
  if (fresh.ok) {
    await cache.put(request, fresh.clone());
    void keepNewest(cache, MAX_ASSETS);
  }
  return fresh;
}

async function coverArt(request, url) {
  const cache = await caches.open(ART_CACHE);
  const saved = await cache.match(request);
  // A URL with a tag names one exact image version: a saved copy is current.
  if (saved && url.searchParams.has("tag")) return saved;
  const refresh = fetch(request)
    .then(async (fresh) => {
      if (fresh.ok || fresh.type === "opaque") {
        await cache.put(request, fresh.clone());
        trimArtSoon();
      }
      return fresh;
    })
    .catch(() => saved ?? Response.error());
  return saved ?? refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") return event.respondWith(pageLoad(request));
  // Streams and downloads must never be cached or delayed.
  if (/\/rest\/(stream|download)/.test(url.pathname)) return;
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    return event.respondWith(buildAsset(request));
  }
  if (url.pathname.includes("/rest/getCoverArt")) return event.respondWith(coverArt(request, url));
});

// ---- Keeping caches in check ----

// Entries come back oldest first.
async function keepNewest(cache, count) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - count))) await cache.delete(key);
}

async function sizeOf(cache, key) {
  const saved = await cache.match(key);
  if (!saved) return 0;
  const declared = Number(saved.headers.get("content-length"));
  if (declared > 0) return declared;
  // Opaque responses don't say; reading them is the only way to know.
  return saved
    .clone()
    .blob()
    .then((blob) => blob.size)
    .catch(() => 0);
}

// Drop the oldest art until the rest fits the budget. Sizing every entry is
// slow, so a burst of new covers (scrolling a grid) leads to one pass, later.
async function trimArt() {
  const cache = await caches.open(ART_CACHE);
  const keys = await cache.keys();
  const sizes = await Promise.all(keys.map((key) => sizeOf(cache, key)));
  let total = sizes.reduce((sum, size) => sum + size, 0);
  for (let i = 0; total > artBudget && i < keys.length; i++) {
    await cache.delete(keys[i]);
    total -= sizes[i];
  }
}

let trimPending = false;
function trimArtSoon() {
  if (trimPending) return;
  trimPending = true;
  setTimeout(() => {
    trimPending = false;
    void trimArt();
  }, 10_000);
}
