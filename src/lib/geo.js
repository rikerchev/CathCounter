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