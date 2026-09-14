// v2.55 — cache name bumped (v1 -> v2) specifically to flush out a possible
// "poisoned" cache entry from before this fix existed: see the fetch
// handler below for exactly how one could get created. Bumping this name
// makes the existing activate handler (which already deletes every cache
// whose name isn't CACHE_NAME) throw away the old, possibly-poisoned "v1"
// cache wholesale the next time this file updates on someone's device —
// nothing about the poisoning could otherwise ever clear itself, since a
// cache-first entry, once stored, is never re-checked against the network.
const CACHE_NAME = "catchcount-shell-v2";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ),
  );
  self.clients.claim();
});

// A response counts as "safe to treat as a real static asset" only if it
// isn't HTML. Why this matters: when a JS/CSS file briefly doesn't exist on
// the server (e.g. the few seconds during a deploy where the old build's
// hashed filenames are gone but a new page hasn't yet requested the new
// ones), Vercel's SPA catch-all rule serves index.html back as the
// response — with a normal 200 OK status, not a 404. `response.ok` alone
// can't tell that apart from a real JS/CSS file, so caching on `ok` alone
// (the bug this replaces) could permanently store that HTML under the JS
// file's own cache key. From then on, cache-first would keep serving that
// stored HTML AS THE JS FILE forever — even once the real file was back —
// which is exactly the "Failed to load module script: ... MIME type of
// text/html" crash a user hit after several rapid version updates in one
// session (v2.52-v2.54): a blank white app, working fine in a private
// window (no leftover cache) but broken in their normal one.
function isPoisonedResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept API calls — those need to hit the network (or fail
  // loudly so the app's own offline queue in src/lib/localDb.js can handle
  // it), never a stale cached JSON response.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: try the network first, fall back to the cached
  // shell so the app still opens offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static assets: cache-first, then fill the cache from the network — but
  // never trust (or store) a poisoned HTML-instead-of-asset response, see
  // isPoisonedResponse() above.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && isPoisonedResponse(cached)) cached = undefined;
      return (
        cached ||
        fetch(request).then((response) => {
          if (response.ok && !isPoisonedResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached)
      );
    }),
  );
});
