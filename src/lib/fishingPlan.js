// v3.194 — "Бъди подготвен": a plan for a FUTURE day and place. It reuses the
// rules of the live advice (src/lib/fishActivity.js: temperature -> pressure ->
// wind, the depth/distance zone, relief and bottom type by season) on the hourly
// FORECAST, and splits the day into six periods. Nothing here changes the advice
// of the active session.
import { rateConditions, decideZone, habitatSeason, fmt, PS_ARROW, compassKey, waveBank } from "@/lib/fishActivity";

/** the forecast reaches today + 15 days */
export const PLAN_DAYS = 16;

/** from/to in hours; "night" runs from 20:00 until 05:00 of the next day (to = 29) */
export const PERIODS = [
  { id: "early", from: 5, to: 8 },
  { id: "forenoon", from: 8, to: 11 },
  { id: "noon", from: 11, to: 14 },
  { id: "afternoon", from: 14, to: 17 },
  { id: "dusk", from: 17, to: 20 },
  { id: "night", from: 20, to: 29 },
];

// how good each period is for the season: 2 best, 1 fair, 0 weak
// order: early, forenoon, noon, afternoon, dusk, night
const PERIOD_RATING = {
  winter: [0, 1, 2, 2, 1, 0],
  spring: [1, 1, 2, 2, 1, 0],
  summer: [2, 1, 0, 1, 2, 2],
  hot: [2, 1, 0, 0, 2, 2],
  autumn: [1, 2, 2, 2, 2, 1],
};

const WATER_TAU_HOURS = 72; // the water follows the air with a lag of ~3 days (same as weather.js)
const FORECAST_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const _cache = new Map();

const r1 = (n) => Math.round(n * 10) / 10;
const pad = (n) => String(n).padStart(2, "0");

/** a Date (calendar pick) -> "YYYY-MM-DD" using its local calendar fields */
export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> Date at local noon (safe from DST edges) */
export function fromYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/**
 * Hourly forecast for the place: 7 past days (for the pressure trend and the
 * water-temperature estimate) + 16 forecast days, in the LOCAL time of the place.
 * Throws when there is no usable answer.
 */
export async function fetchForecast(lat, lng) {
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < FORECAST_TTL_MS) return hit.f;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m` +
    `&past_days=7&forecast_days=${PLAN_DAYS}&wind_speed_unit=ms&timezone=auto`;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error("forecast_failed");
    const d = await res.json();
    const h = d.hourly;
    if (!h || !Array.isArray(h.time) || h.time.length < 48) throw new Error("forecast_no_data");
    const f = {
      times: h.time,
      temp: h.temperature_2m || [],
      press: h.pressure_msl || [],
      speed: h.wind_speed_10m || [],
      dir: h.wind_direction_10m || [],
      offsetSec: Number(d.utc_offset_seconds) || 0,
    };
    _cache.set(key, { t: Date.now(), f });
    return f;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** today's date and hour at the place, and the last day the forecast covers */
export function forecastRange(f) {
  const iso = new Date(Date.now() + f.offsetSec * 1000).toISOString();
  return { today: iso.slice(0, 10), hour: Number(iso.slice(11, 13)), max: String(f.times[f.times.length - 1]).slice(0, 10) };
}

function mean(arr) {
  const v = arr.filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function meanDirection(degs) {
  const v = degs.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  let s = 0;
  let c = 0;
  for (const d of v) {
    s += Math.sin((d * Math.PI) / 180);
    c += Math.cos((d * Math.PI) / 180);
  }
  return (Math.round((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360;
}

/** water temperature estimate at hour `idx`: lagging mean of the last 7 days of air temperature */
function estimateWater(temp, idx) {
  const alpha = 1 - Math.exp(-1 / WATER_TAU_HOURS);
  let ew = null;
  for (let i = Math.max(0, idx - 167); i <= idx; i++) {
    const v = temp[i];
    if (typeof v !== "number") continue;
    ew = ew == null ? v : ew + alpha * (v - ew);
  }
  return ew == null ? null : Math.round(Math.max(0, Math.min(32, ew)) * 2) / 2;
}

function levelOf(score) {
  return score >= 80 ? "high" : score >= 62 ? "good" : score >= 42 ? "medium" : "low";
}

/**
 * The plan for one day: six periods, each rated on the forecast for its hours.
 * -> null when the day is outside the forecast.
 */
export function buildPlan({ forecast, dateStr }) {
  const f = forecast;
  const d0 = f.times.indexOf(`${dateStr}T00:00`);
  if (d0 < 0) return null;
  const range = forecastRange(f);
  const month = Number(dateStr.slice(5, 7)) - 1;
  const daysAhead = Math.round((Date.parse(dateStr) - Date.parse(range.today)) / 86400000);
  const isToday = dateStr === range.today;

  const periods = PERIODS.map((p, pi) => {
    const hours = [];
    for (let h = p.from; h < p.to; h++) {
      const i = d0 + h;
      if (i < f.times.length) hours.push(i);
    }
    if (hours.length === 0) return { id: p.id, from: p.from, to: p.to, unavailable: true };
    const mid = hours[Math.floor(hours.length / 2)];
    const at = (arr, i) => (typeof arr[i] === "number" ? arr[i] : null);

    const cur = {
      air_temperature: mean(hours.map((i) => at(f.temp, i))),
      air_pressure: at(f.press, mid),
      wind_speed: mean(hours.map((i) => at(f.speed, i))),
      wind_direction: meanDirection(hours.map((i) => at(f.dir, i))),
      water_temperature: estimateWater(f.temp, mid),
    };
    if (cur.air_pressure != null && at(f.press, mid - 3) != null) cur.pressure_trend = r1(cur.air_pressure - f.press[mid - 3]);
    if (cur.air_pressure != null && at(f.press, mid - 24) != null) cur.pressure_change_24h = r1(cur.air_pressure - f.press[mid - 24]);
    const airD24 = at(f.temp, mid) != null && at(f.temp, mid - 24) != null ? r1(f.temp[mid] - f.temp[mid - 24]) : null;

    const r = rateConditions(cur, { month, airD24 });
    const zone = decideZone(r, cur, month);
    const season = habitatSeason(month, cur.water_temperature);
    const tod = PERIOD_RATING[season][pi];
    const score = Math.max(0, Math.min(100, r.score + (tod === 2 ? 8 : tod === 0 ? -12 : 0)));

    const hourNow = range.hour;
    const passed = isToday && (p.to <= 24 ? p.to <= hourNow : false);
    const current = isToday && (p.to <= 24 ? hourNow >= p.from && hourNow < p.to : hourNow >= p.from);
    return { id: p.id, from: p.from, to: p.to, cur, r, zone: zone.zone, season, tod, score, level: levelOf(score), passed, current };
  });

  const usable = periods.filter((p) => !p.unavailable && !p.passed);
  const ranked = usable.slice().sort((a, b) => b.score - a.score);
  const topScore = ranked.length ? ranked[0].score : 0;
  // the best periods: the strongest, plus any within 5 points of it, at most 3
  const best = ranked.filter((p) => p.score >= topScore - 5).slice(0, 3).map((p) => p.id);
  const noon = periods.find((p) => p.id === "noon" && !p.unavailable) || periods.find((p) => !p.unavailable);
  return {
    dateStr,
    daysAhead,
    isToday,
    periods,
    best,
    bestLevel: ranked.length ? ranked[0].level : null,
    season: noon ? noon.season : null,
    water: noon && noon.cur ? noon.cur.water_temperature : null,
  };
}

/** all the texts of one period, from the translation function `t` */
export function describePeriod(p, t) {
  const dec = t("fa.dec") === "fa.dec" ? "." : t("fa.dec");
  const n = (v) => String(r1(v)).replace(".", dec);
  const c = p.cur;
  const chips = [];
  if (c.air_temperature != null) {
    chips.push({
      id: "temp",
      text:
        c.water_temperature != null
          ? fmt(t("fa.chip.s.temp"), { a: Math.round(c.air_temperature), w: Math.round(c.water_temperature) })
          : fmt(t("fa.chip.s.air"), { a: Math.round(c.air_temperature) }),
    });
  }
  if (c.air_pressure != null) chips.push({ id: "press", text: fmt(t("fa.chip.s.press"), { v: Math.round(c.air_pressure), s: PS_ARROW[p.r.ps] || "" }) });
  if (c.wind_speed != null) {
    const dirLabel = c.wind_direction != null ? t("compass." + compassKey(c.wind_direction)) : "";
    chips.push({ id: "wind", text: fmt(t("fa.chip.s.wind"), { v: n(c.wind_speed), dir: dirLabel && c.wind_speed >= 1 ? " " + dirLabel : "" }) });
  }
  let rec = t(["fa.z.near", "fa.z.mid", "fa.z.deep"][p.zone]);
  if (p.r.waves && p.zone <= 1 && c.wind_direction != null) rec += " " + fmt(t("fa.z.waveNear"), { bank: t("fa.bank." + waveBank(c.wind_direction)) });
  return {
    chips,
    rec,
    rel: t("fa.w.rel." + p.zone),
    bot: t("fa.w.bot." + p.season),
    badge: t("fa.level." + p.level) + " · " + p.score,
  };
}

// ---- saved plans (this device only) -------------------------------------------

const PLANS_KEY = "catchcount_plans_v1";
const keyFor = (uid) => `${PLANS_KEY}_${uid || ""}`;

export function readPlans(uid) {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((p) => p && p.date && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  } catch {
    return [];
  }
}

function writePlans(uid, plans) {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(plans));
  } catch {
    // storage unavailable
  }
}

/** adds (or refreshes) a plan: the same date and place (within ~1 km) is one plan */
export function savePlan(uid, plan) {
  const all = readPlans(uid).filter((p) => !(p.date === plan.date && Math.abs(p.lat - plan.lat) < 0.01 && Math.abs(p.lng - plan.lng) < 0.01));
  all.push({ ...plan, id: `${Date.now()}`, savedAt: Date.now() });
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writePlans(uid, all);
  return all;
}

export function deletePlan(uid, id) {
  const all = readPlans(uid).filter((p) => p.id !== id);
  writePlans(uid, all);
  return all;
}
