// v2.55 — cache name bumped (v1 -> v2) specifically to flush out a possible
// "poisoned" cache entry from before this fix existed: see the fetch
// handler below for exactly how one could get created. Bumping this name
// makes the existing activate handler (which already deletes every cache
// whose name isn't CACHE_NAME) throw away the old, possibly-poisoned "v1"
// cache wholesale the next time this file updates on someone's device —
// nothing about the poisoning could otherwise ever clear itself, since a
// cache-first entry, once stored, is never re-checked against the network.
//
// v2.64 — bumped again (v2 -> v3): manifest.json now has an explicit "id"
// field (see public/manifest.json), but manifest.json is itself one of the
// APP_SHELL entries below — cached cache-first, so a device that had
// already visited before this change would otherwise keep serving its OLD
// cached manifest.json (without "id") indefinitely, never picking up the
// fix. Bumping CACHE_NAME forces exactly this kind of already-cached static
// file to be re-fetched from the network the next time this file updates.
//
// v3.96 — bumped again (v3 -> v4), and the actual bug fixed this time, not
// just flushed: brochure-template.jpg is a static asset (not in APP_SHELL,
// but cached the same cache-first way as everything else below) that has
// now been edited several times in a row (v3.88, v3.93, v3.94, v3.95) to
// fix its text. A device that had EVER downloaded a brochure before any of
// those fixes kept serving that one original cached copy forever — cache-
// first means the cached entry is never re-checked against the network
// once stored, no matter how many times the real file changes server-side
// afterward. This is why a user could be running the latest app version
// (visible in the footer, since index.html/JS bundles DO get this same
// flush on every CACHE_NAME bump) yet still download a brochure with
// months-old text ("Отвори" instead of "Регистрирай се"): the JS updated,
// the image never did, on that one device. Bumping CACHE_NAME flushes that
// stale copy immediately; the fetch handler below is ALSO changed so this
// exact class of bug can't quietly reappear the next time an unhashed
// public/ asset gets edited.
const CACHE_NAME = "catchcount-shell-v4";
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
  //
  // v2.75 fix — caches.match() resolves to `undefined` when the shell isn't
  // cached yet (e.g. right after this file itself updates and the browser
  // hasn't finished re-populating CACHE_NAME under its new name — see the
  // CACHE_NAME comment above). event.respondWith(undefined) is not a
  // response the browser can use: it throws "Uncaught TypeError: Failed to
  // convert value to 'Response'" inside this service worker, and the page
  // that triggered the navigation sees a hard "network error" instead of
  // ever finding out the real cause was just a slow/flaky network blip —
  // which is exactly the "Грешка при зареждане: Request timed out" a user
  // could hit switching pages on a slow connection. A network failure
  // should never come back as anything other than a real Response.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then(
          (cached) =>
            cached ||
            new Response(
              "<!doctype html><title>CatchCount</title><body>Няма връзка. Презаредете страницата, когато сте онлайн.</body>",
              { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
            ),
        ),
      ),
    );
    return;
  }

  // Static assets: v3.96 — stale-while-revalidate instead of plain
  // cache-first. A cached hit still answers immediately (same speed,
  // same offline support as before), but a network re-fetch now always
  // runs alongside it to refresh the cache for next time — via
  // event.waitUntil(), so it keeps running even after the response has
  // already gone back to the page. Plain cache-first (what this replaces)
  // never re-checked the network once an entry existed, so any unhashed
  // file under public/ — brochure-template.jpg being the real example
  // that surfaced this (see CACHE_NAME's own v3.96 note above) — stayed
  // stuck on whichever copy was first ever cached, forever, no matter how
  // many times it changed on the server afterward. Never trust (or store)
  // a poisoned HTML-instead-of-asset response, see isPoisonedResponse()
  // above.
  event.respondWith(
    caches.match(request).then((cached) => {
      const validCached = cached && !isPoisonedResponse(cached) ? cached : null;

      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok && !isPoisonedResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => null);

      if (validCached) {
        // Answer now from cache; let the refresh finish in the background.
        event.waitUntil(networkFetch);
        return validCached;
      }

      // Nothing usable cached yet: this request has to wait on the network.
      // Always resolve to a real Response (never undefined) — see the
      // navigate-request comment above for exactly what breaks otherwise.
      return networkFetch.then(
        (response) => response || new Response(null, { status: 504, statusText: "Offline and not cached" }),
      );
    }),
  );
});
