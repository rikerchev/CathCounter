// Detects the user's country from their IP address for ad targeting.
// Uses ipapi.co free API, caches result in localStorage for 24h.

const CACHE_KEY = "detected_country_code";
const CACHE_TIMESTAMP_KEY = "detected_country_ts";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let fetchPromise = null;

export function getCachedCountry() {
  try {
    const code = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!code || !ts) return null;
    if (Date.now() - parseInt(ts, 10) > CACHE_TTL_MS) return null;
    return code;
  } catch {
    return null;
  }
}

export function detectCountry() {
  const cached = getCachedCountry();
  if (cached) return Promise.resolve(cached);

  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } })
    .then((res) => res.json())
    .then(async (data) => {
      const code = (data.country_code || "").toUpperCase();
      if (code) {
        localStorage.setItem(CACHE_KEY, code);
        localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
        // Persist country on user profile
        try {
          const { base44 } = await import("@/api/base44Client");
          const authed = await base44.auth.isAuthenticated();
          if (authed) {
            await base44.auth.updateMe({ country: code });
          }
        } catch {
          // ignore — non-critical
        }
      }
      fetchPromise = null;
      return code || null;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });

  return fetchPromise;
}

export function getDetectedCountrySync() {
  return getCachedCountry();
}

// v3.37 — a SEPARATE, much-shorter-lived country lookup for language
// defaulting (src/lib/i18n.jsx). detectCountry() above deliberately caches
// for a full 24h — fine for ad targeting, where a stale country for a day
// is harmless — but it meant a visitor who switched their VPN's exit
// country and reloaded within that same 24h window kept getting the OLD
// cached country for language purposes too (detectCountry() short-circuits
// on any non-expired cache without ever hitting the network again), so the
// language silently never updated. This uses its own localStorage keys and
// a 5-minute TTL instead: long enough that normal reloads/navigation don't
// re-hit ipapi.co on every page view, short enough that a VPN switch (or a
// traveler's phone actually changing country) shows up again within
// minutes rather than up to a day later. Does not touch or reuse
// detectCountry()'s own cache — the two are independent on purpose, so
// fixing this can't change ad-targeting behavior.
const LANG_CACHE_KEY = "detected_country_code_lang";
const LANG_CACHE_TIMESTAMP_KEY = "detected_country_ts_lang";
const LANG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let langFetchPromise = null;

export function detectCountryForLanguage() {
  try {
    const code = localStorage.getItem(LANG_CACHE_KEY);
    const ts = localStorage.getItem(LANG_CACHE_TIMESTAMP_KEY);
    if (code && ts && Date.now() - parseInt(ts, 10) <= LANG_CACHE_TTL_MS) {
      return Promise.resolve(code);
    }
  } catch {
    // fall through to a fresh fetch
  }

  if (langFetchPromise) return langFetchPromise;

  langFetchPromise = fetch("https://ipapi.co/json/", { headers: { Accept: "application/json" } })
    .then((res) => res.json())
    .then((data) => {
      const code = (data.country_code || "").toUpperCase();
      if (code) {
        try {
          localStorage.setItem(LANG_CACHE_KEY, code);
          localStorage.setItem(LANG_CACHE_TIMESTAMP_KEY, String(Date.now()));
        } catch {
          // ignore
        }
      }
      langFetchPromise = null;
      return code || null;
    })
    .catch(() => {
      langFetchPromise = null;
      return null;
    });

  return langFetchPromise;
}