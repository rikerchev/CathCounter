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
const CACHE_KEY = "catchcount_last_weather_v2"; // v3.173: readings now also carry air_pressure
const MAX_AGE_MS = 24 * 60 * 60 * 1000;        // older than this is no longer "the weather around now"
const MAX_DISTANCE_KM = 100;                    // a reading from another region is not used
const REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000; // refreshWeatherCache() at most this often
const REFRESH_SAME_PLACE_KM = 5;
const FETCH_TIMEOUT_MS = 8000;
const HISTORY_KEY = "catchcount_weather_history_v1"; // v3.176: last 48 h (temperature, pressure, wind) for the chart
const HISTORY_HOURS = 48;
const WATER_MANUAL_KEY = "catchcount_water_temp_manual";
const WATER_MANUAL_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const ADVICE_BASELINE_KEY = "catchcount_advice_baseline";
const ADVICE_BASELINE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const WATER_TAU_HOURS = 72; // the water follows the air temperature with a lag of ~3 days

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

function writeHistory(lat, lng, points) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ t: Date.now(), lat, lng, points }));
  } catch {
    // storage unavailable — the chart just has no data
  }
}

/**
 * v3.176 — hourly readings of the last 48 hours [{ t (ms), temp (°C), press (hPa),
 * wind (m/s) }] remembered with the last successful weather request, or null.
 */
export function getWeatherHistory(lat, lng) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw);
    if (!h || !Array.isArray(h.points) || h.points.length < 2 || Date.now() - h.t > MAX_AGE_MS) return null;
    if (lat != null && lng != null && h.lat != null && h.lng != null && distanceKm(lat, lng, h.lat, h.lng) > MAX_DISTANCE_KM) return null;
    return h.points;
  } catch {
    return null;
  }
}

/** The water temperature the angler measured himself (valid for 12 h), or null. */
export function getManualWaterTemp() {
  try {
    const raw = localStorage.getItem(WATER_MANUAL_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    if (!m || typeof m.v !== "number" || Date.now() - m.t > WATER_MANUAL_MAX_AGE_MS) return null;
    return m.v;
  } catch {
    return null;
  }
}

/** Remembers a measured water temperature (null clears it). */
export function setManualWaterTemp(v) {
  try {
    if (v == null || Number.isNaN(Number(v))) localStorage.removeItem(WATER_MANUAL_KEY);
    else localStorage.setItem(WATER_MANUAL_KEY, JSON.stringify({ v: Number(v), t: Date.now() }));
  } catch {
    // storage unavailable
  }
}

/** The reading the last fish-activity advice was based on (valid for 12 h), or null. */
export function getAdviceBaseline() {
  try {
    const raw = localStorage.getItem(ADVICE_BASELINE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    return b && b.w && Date.now() - b.t <= ADVICE_BASELINE_MAX_AGE_MS ? b.w : null;
  } catch {
    return null;
  }
}

export function setAdviceBaseline(w) {
  try {
    localStorage.setItem(ADVICE_BASELINE_KEY, JSON.stringify({ t: Date.now(), w }));
  } catch {
    // storage unavailable
  }
}

/**
 * Fetches current weather for given coordinates from Open-Meteo.
 * Returns { air_temperature, cloudiness, wind_speed, air_pressure, wind_direction,
 * pressure_trend (hPa over the last 3 h), pressure_change_24h, water_temperature
 * (measured by the angler if given in the last 12 h, otherwise ESTIMATED from the
 * last 7 days of air temperature), water_temperature_estimated } and remembers it.
 * Throws when there is no usable answer (network, timeout, empty data).
 */
export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,pressure_msl&hourly=temperature_2m,pressure_msl,wind_speed_10m&past_days=7&forecast_days=1&wind_speed_unit=ms`;
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
    // v3.173 — atmospheric pressure, hPa, reduced to sea level (pressure_msl):
    // what weather sites and barometers show. Optional: no pressure in the
    // answer just leaves it out (never a made-up 0).
    if (typeof cur.pressure_msl === "number") result.air_pressure = Math.round(cur.pressure_msl * 10) / 10;
    if (typeof cur.wind_direction_10m === "number") result.wind_direction = Math.round(cur.wind_direction_10m);

    // v3.174 — hourly history: pressure trend + a water temperature estimate.
    const times = data.hourly?.time || [];
    const hTemp = data.hourly?.temperature_2m || [];
    const hPress = data.hourly?.pressure_msl || [];
    const nowHour = typeof cur.time === "string" ? cur.time.slice(0, 13) : null;
    const idx = nowHour ? times.findIndex((t) => String(t).slice(0, 13) === nowHour) : -1;
    if (idx >= 0 && typeof cur.pressure_msl === "number") {
      if (idx >= 3 && typeof hPress[idx - 3] === "number") {
        result.pressure_trend = Math.round((cur.pressure_msl - hPress[idx - 3]) * 10) / 10;
      }
      if (idx >= 24 && typeof hPress[idx - 24] === "number") {
        result.pressure_change_24h = Math.round((cur.pressure_msl - hPress[idx - 24]) * 10) / 10;
      }
    }
    // v3.176 — the water temperature is always the ESTIMATE (nobody measures it);
    // the old "measured by the angler" override is gone.
    if (idx >= 24) {
      // water follows the air with a lag: exponentially weighted mean of the
      // last 7 days of hourly air temperature (time constant ~3 days)
      const alpha = 1 - Math.exp(-1 / WATER_TAU_HOURS);
      let ew = null;
      for (let i = Math.max(0, idx - 167); i <= idx; i++) {
        const v = hTemp[i];
        if (typeof v !== "number") continue;
        ew = ew == null ? v : ew + alpha * (v - ew);
      }
      if (ew != null) {
        result.water_temperature = Math.round(Math.max(0, Math.min(32, ew)) * 2) / 2;
        result.water_temperature_estimated = true;
      }
    }
    // v3.176 — the last 48 hours, for the chart on the advice card
    if (idx >= 0) {
      const hWind = data.hourly?.wind_speed_10m || [];
      const from = Math.max(0, idx - (HISTORY_HOURS - 1));
      const pts = [];
      for (let i = from; i <= idx; i++) {
        const ms = Date.parse(`${times[i]}Z`);
        if (Number.isNaN(ms)) continue;
        const rd = (v) => (typeof v === "number" ? Math.round(v * 10) / 10 : null);
        pts.push({ t: ms, temp: rd(hTemp[i]), press: rd(hPress[i]), wind: rd(hWind[i]) });
      }
      if (pts.length >= 2) writeHistory(lat, lng, pts);
    }
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
