/**
 * Weather for a catch — Open-Meteo (free, no API key).
 *
 * v3.171 — the last successful reading is remembered on the device (with where
 * and when it was taken). A catch made while the device is OFFLINE (or whose
 * request failed / was too slow) gets that last known reading, i.e. the weather
 * from the moment the device was last online, instead of no weather at all.
 */

// v3.172 — "_v2": readings remembered by v3.171 hold the wind in km/h; the new
// key keeps them from being mixed with the m/s ones.
const CACHE_KEY = "catchcount_last_weather_v2";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;        // older than this is no longer "the weather around now"
const MAX_DISTANCE_KM = 100;                    // a reading from another region is not used
const REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000; // refreshWeatherCache() at most this often
const REFRESH_SAME_PLACE_KM = 5;
const FETCH_TIMEOUT_MS = 8000;

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.w && typeof c.t === "number" ? c : null;
  } catch {
    return null;
  }
}

function writeCache(lat, lng, w) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), lat, lng, w }));
  } catch {
    // storage unavailable — the weather just is not remembered
  }
}

/**
 * Fetches current weather for given coordinates from Open-Meteo.
 * Returns { air_temperature, cloudiness, wind_speed } and remembers it.
 * Throws when there is no usable answer (network, timeout, empty data).
 */
export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,cloud_cover,wind_speed_10m&wind_speed_unit=ms`;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error("weather_fetch_failed");
    const data = await res.json();
    const cur = data.current || {};
    // v3.171 — an answer without a temperature used to be turned into
    // "0 degrees, clear sky"; that is not a reading, so it is an error now.
    if (typeof cur.temperature_2m !== "number") throw new Error("weather_no_data");
    const cloudCover = cur.cloud_cover ?? 0;
    let cloudiness = "clear";
    if (cloudCover > 75) cloudiness = "overcast";
    else if (cloudCover > 50) cloudiness = "cloudy";
    else if (cloudCover > 25) cloudiness = "partly_cloudy";
    // v3.172 — the wind is requested in m/s (wind_speed_unit=ms): Open-Meteo
    // answers in km/h by default, while the app (and the weather sites people
    // compare with) show m/s.
    const result = {
      air_temperature: Math.round(cur.temperature_2m * 10) / 10,
      cloudiness,
      wind_speed: Math.round((cur.wind_speed_10m ?? 0) * 10) / 10,
    };
    writeCache(lat, lng, result);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The weather from the moment this device last had a connection (null when
 * there is none, it is too old, or it was taken far from lat/lng). Without
 * coordinates the age check alone applies.
 */
export function getLastKnownWeather(lat, lng) {
  const c = readCache();
  if (!c || Date.now() - c.t > MAX_AGE_MS) return null;
  if (lat != null && lng != null && c.lat != null && c.lng != null && distanceKm(lat, lng, c.lat, c.lng) > MAX_DISTANCE_KM) {
    return null;
  }
  return { ...c.w, last_known_at: c.t };
}

/**
 * Weather for a catch: live when online and the request works, otherwise the
 * last known reading. Resolves to null only when there is nothing at all.
 */
export async function getWeatherForCatch(lat, lng) {
  if (lat != null && lng != null && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    try {
      return await fetchWeather(lat, lng);
    } catch {
      // fall through to the last known reading
    }
  }
  return getLastKnownWeather(lat, lng);
}

/**
 * Best-effort refresh of the remembered reading while the device is online
 * (called during an active session), so that an offline catch later in the
 * session has a recent one to fall back to. Cheap: skipped when the last
 * reading is under 10 minutes old and from the same place.
 */
export async function refreshWeatherCache(lat, lng) {
  if (lat == null || lng == null) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const c = readCache();
  if (c && Date.now() - c.t < REFRESH_MIN_INTERVAL_MS && c.lat != null && c.lng != null && distanceKm(lat, lng, c.lat, c.lng) < REFRESH_SAME_PLACE_KM) {
    return;
  }
  try {
    await fetchWeather(lat, lng);
  } catch {
    // best-effort
  }
}
