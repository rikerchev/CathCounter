// Fish-activity forecast for the carp family (carp, crucian, bream, grass carp).
// v3.174 — turns the weather readings from src/lib/weather.js into an
// expected-activity rating and advice on where/how to fish. Pure functions; all
// texts come from the translation files (keys "fa.*" and "compass.*").
//
// v3.190 — plus a "where and when" block (relief, bottom type, time of day), see buildWhere below.
//
// v3.176 — ONE integrated analysis instead of a list of independent tips. The
// three components are weighed in a fixed order of importance and can never
// contradict each other:
//   1. TEMPERATURE (air -> water)          — the base; 50 of 100 points; it sets the
//                                            starting depth/distance and can LOCK it
//   2. PRESSURE (level, sharp/gradual)     — 30 points; may shift the result one step
//   3. WIND (speed + the bank it blows toward) — 20 points; may shift it one more step
// The depth/distance is a single scale: 0 = close to the bank / shallow,
// 1 = middle distance and depth, 2 = far out / deep. Every line of the card says
// what that component does to the result ("moves it", "confirms it", "does not
// change it", "is outweighed by the water temperature").
//
// Rules (from the angling guidance the app's author supplied):
//  - pressure: stable, or slowly falling, is best; a sharp fall or rise (or very
//    high pressure) switches the fish off and sends it to the bottom / cover;
//  - wind: 2-5 m/s is ideal, S/SW/W warms, N/NE/E cools, a flat calm in summer
//    starves the water of oxygen; in spring and summer the fish gather on the
//    bank the waves hit (more oxygen and food there) — that is the bank the wind
//    blows TOWARD (wind from the east -> the west bank), whatever the angler's own position;
//  - water temperature: 18-24 C is optimal, below 8-10 C it is torpid, above
//    26-28 C it feeds only at night / early morning / deeper.

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** 0..360 degrees -> "N" | "NE" | ... */
export function compassKey(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return null;
  const d = ((Number(deg) % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}

/** nearest of the 8 compass directions in degrees (0,45,...,315) */
export function nearestOctant(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return null;
  const d = ((Number(deg) % 360) + 360) % 360;
  return (Math.round(d / 45) % 8) * 45;
}

export function fmt(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] != null ? String(params[k]) : m));
}

const r1 = (n) => Math.round(n * 10) / 10;
const r0 = (n) => Math.round(n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function pressureState(p, d3) {
  if (d3 != null && d3 <= -3) return "fastFall";
  if (d3 != null && d3 <= -1) return "slowFall";
  if (d3 != null && d3 >= 3) return "fastRise";
  if (p != null && p >= 1022) return "high";
  if (d3 != null && d3 >= 1) return "slowRise";
  return "stable";
}

function windClass(speed) {
  if (speed == null) return null;
  if (speed < 1) return "calm";
  if (speed > 8) return "strong";
  return "ok";
}

// good: S, SW, W (warming); bad: N, NE, E (cooling); neutral: SE, NW, calm
function dirClass(deg, speed) {
  if (deg == null || speed == null || speed < 1) return "neutral";
  const d = ((Number(deg) % 360) + 360) % 360;
  if (d >= 158 && d <= 293) return "good";
  if (d >= 338 || d <= 112) return "bad";
  return "neutral";
}

function waterClass(w) {
  if (w == null) return null;
  if (w < 10) return "cold";
  if (w < 15) return "cool";
  if (w <= 26) return "optimal";
  return "hot";
}

// the bank the waves hit = the direction the wind blows TOWARD (e.g. from E -> W)
export function waveBank(windFrom) {
  return compassKey((Number(windFrom) + 180) % 360);
}

const isSummer = (month) => month >= 5 && month <= 7;
// spring and summer (Mar-Aug): the fish follow the waves to the bank
const isBankSeason = (month) => month >= 2 && month <= 7;

/** air temperature change over the last 24 h from the hourly history, or null */
export function airChange24(history) {
  if (!Array.isArray(history) || history.length < 25) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 25];
  if (typeof last?.temp !== "number" || typeof prev?.temp !== "number") return null;
  return r1(last.temp - prev.temp);
}

/**
 * c = { air_pressure, pressure_trend, pressure_change_24h, wind_speed, wind_direction,
 *       water_temperature, air_temperature }
 * ctx = { month, airD24 }
 * -> { score 0..100, level, ps, wc, dc, tc, waves }
 */
export function rateConditions(c, ctx = {}) {
  const month = ctx.month ?? new Date().getMonth();
  const ps = pressureState(c.air_pressure, c.pressure_trend);
  const wc = windClass(c.wind_speed);
  const dc = dirClass(c.wind_direction, c.wind_speed);
  const w = c.water_temperature;
  const tc = waterClass(w);
  // waves that make the fish gather on the bank they hit: spring/summer, water 10-26 C, 2-8 m/s
  const waves =
    c.wind_direction != null && c.wind_speed != null && c.wind_speed >= 2 && c.wind_speed <= 8 &&
    isBankSeason(month) && (w == null || (w >= 10 && w <= 26));

  // 1. temperature — 0..50
  let temp;
  if (w == null) temp = 26;
  else if (w < 6) temp = 6;
  else if (w < 8) temp = 10;
  else if (w < 10) temp = 15;
  else if (w < 12) temp = 22;
  else if (w < 15) temp = 30;
  else if (w < 18) temp = 38;
  else if (w <= 24) temp = 50;
  else if (w <= 26) temp = 44;
  else if (w <= 28) temp = 32;
  else temp = 20;
  const d24 = ctx.airD24;
  if (d24 != null && w != null) {
    if (w < 18) temp += d24 >= 3 ? 4 : d24 <= -3 ? -5 : 0; // warming wakes the fish, a cold snap puts it to sleep
    else if (w > 24) temp += d24 <= -3 ? 3 : d24 >= 3 ? -3 : 0; // in the heat it is the other way round
  }
  temp = clamp(temp, 0, 50);

  // 2. pressure — 0..30
  let press = { slowFall: 30, stable: 27, slowRise: 20, high: 14, fastRise: 8, fastFall: 6 }[ps];
  if (ps === "stable" && c.air_pressure != null && c.air_pressure < 1005) press = 17; // stable but low
  const ch24 = c.pressure_change_24h;
  if (ch24 != null && Math.abs(ch24) >= 10) press -= 4; // a big swing in a day: the fish are still adjusting
  press = clamp(press, 0, 30);

  // 3. wind — 0..20
  let wind;
  if (c.wind_speed == null) wind = 10;
  else if (c.wind_speed < 1) wind = isSummer(month) ? 4 : 10;
  else if (c.wind_speed < 2) wind = 12;
  else if (c.wind_speed <= 5) wind = 20;
  else if (c.wind_speed <= 8) wind = 14;
  else wind = 4;
  if (c.wind_speed != null && c.wind_speed >= 1) {
    const hot = w != null && w > 24;
    if (dc === "good") wind += hot ? -2 : 3; // warming wind
    else if (dc === "bad") wind += hot ? 2 : -3; // cooling wind
  }
  if (waves) wind += 2;
  wind = clamp(wind, 0, 20);

  const score = clamp(Math.round(temp + press + wind), 0, 100);
  const level = score >= 80 ? "high" : score >= 62 ? "good" : score >= 42 ? "medium" : "low";
  return { score, level, ps, wc, dc, tc, waves };
}

/** Lines describing what changed between two readings (only the drastic ones). */
function detectChanges(prev, cur, t, n) {
  const out = [];
  if (!prev || !cur) return out;
  if (cur.air_pressure != null && prev.air_pressure != null) {
    const d = cur.air_pressure - prev.air_pressure;
    if (Math.abs(d) >= 3) {
      out.push(fmt(t(d < 0 ? "fa.chg.pFall" : "fa.chg.pRise"), { from: r0(prev.air_pressure), to: r0(cur.air_pressure) }));
    }
  }
  if (cur.air_temperature != null && prev.air_temperature != null) {
    const d = cur.air_temperature - prev.air_temperature;
    if (Math.abs(d) >= 4) {
      out.push(fmt(t(d < 0 ? "fa.chg.tFall" : "fa.chg.tRise"), { from: n(prev.air_temperature), to: n(cur.air_temperature) }));
    }
  }
  if (cur.wind_speed != null && prev.wind_speed != null) {
    const d = cur.wind_speed - prev.wind_speed;
    if (Math.abs(d) >= 3) {
      out.push(fmt(t(d > 0 ? "fa.chg.wUp" : "fa.chg.wDown"), { from: n(prev.wind_speed), to: n(cur.wind_speed) }));
    }
  }
  const pd = dirClass(prev.wind_direction, prev.wind_speed);
  const cd = dirClass(cur.wind_direction, cur.wind_speed);
  if (pd !== cd && (cd === "bad" || cd === "good") && cur.wind_direction != null) {
    const dir = t("compass." + compassKey(cur.wind_direction));
    out.push(fmt(t(cd === "bad" ? "fa.chg.dirBad" : "fa.chg.dirGood"), { dir }));
  }
  return out;
}

/**
 * The single depth/distance verdict. 0 = close to the bank / shallow, 1 = middle,
 * 2 = far out / deep. Order of weight: temperature (base + locks), pressure (one
 * step), wind (one more step). Returns the result and what each factor asked for.
 */
export function decideZone(r, c, month) {
  const w = c.water_temperature;
  // the base, and the range the water temperature allows at all
  let base = 1;
  let min = 0;
  const max = 2;
  if (w != null) {
    if (w < 8) { base = 2; min = 2; }
    else if (w < 10) { base = 2; min = 1; }
    else if (w < 15) base = 1;
    else if (w <= 26) base = 0;
    else if (w <= 28) { base = 2; min = 1; }
    else { base = 2; min = 2; }
  }
  const asked = {
    press: { slowFall: -1, stable: 0, slowRise: 0, fastFall: 1, fastRise: 1, high: 1 }[r.ps],
    wind: 0,
  };
  // wind: strong -> shelter/deeper; waves in spring/summer -> close to the bank they
  // hit; calm summer heat -> deeper; cold wind -> deeper
  if (r.wc === "strong") asked.wind = 1;
  else if (r.waves) asked.wind = -1;
  else if (r.wc === "calm" && isSummer(month) && (w == null || w >= 18)) asked.wind = 1;
  else if (r.dc === "bad" && w != null && w <= 24 && c.wind_speed >= 2) asked.wind = 1;

  const z0 = clamp(base, min, max);
  const z1 = clamp(z0 + asked.press, min, max);
  const z2 = clamp(z1 + asked.wind, min, max);
  return { zone: z2, locked: min === max, z0, z1, z2, asked };
}

// what a factor did to the verdict: "none" | "shift" | "agree" | "limited"
function effectOf(asked, before, after) {
  if (asked === 0) return "none";
  if (after !== before) return "shift";
  if ((asked > 0 && before === 2) || (asked < 0 && before === 0)) return "agree";
  return "limited"; // the water temperature does not allow it
}

// ---------------------------------------------------------------------------
// v3.190 — WHERE and WHEN. On top of the weather verdict (depth/distance zone) the
// card says what RELIEF and BOTTOM TYPE to look for and what TIME OF DAY is best
// for the current season (general rules for the carp family; the angler judges the
// relief and the bottom of his own spot and chooses where to cast):
//  - relief follows the zone verdict: 0 shallows (bays, plateaus, weed edge),
//    1 transitions (ledges, foot of bars, old river-bed slopes), 2 deep (pits, holes,
//    the deepest old river bed);
//  - bottom type follows the season: spring = thin living silt in warm bays; summer =
//    thin silt + weed edge, mussel beds; autumn = hard/silt transitions on slopes;
//    winter = hard or slightly silty bottom in the deepest pits; great heat = hard or
//    thinly silted ledges/pits and oxygen near plants. Thick stagnant silt and bare
//    sand are always poor;
//  - the best spot is a border between two zones (hard/silt, weed edge, foot of a bar);
//  - time of day: winter midday/afternoon; spring late morning-afternoon; summer dawn,
//    dusk and night; great heat only night/dawn/dusk; autumn the whole day.
// ---------------------------------------------------------------------------

/** "winter" | "spring" | "summer" | "hot" | "autumn" — water temperature first, then the month */
export function habitatSeason(month, w) {
  if (w != null && w < 8) return "winter";
  if (w != null && w > 26) return "hot";
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  // Dec-Feb with water of 8 C or more: Feb is already spring-like, Dec/Jan are cool autumn
  if (w == null) return "winter";
  return month === 1 ? "spring" : "autumn";
}

// [night 21-5, dawn 5-8, morning 8-11, midday 11-16, afternoon 16-19, evening 19-21]: 2 best, 1 fair, 0 weak
const PHASE_RATING = {
  winter: [0, 0, 1, 2, 2, 0],
  spring: [0, 1, 1, 2, 2, 1],
  summer: [2, 2, 1, 0, 1, 2],
  hot: [2, 2, 1, 0, 0, 2],
  autumn: [1, 1, 2, 2, 2, 2],
};

export function phaseIndex(h) {
  if (h >= 21 || h < 5) return 0;
  if (h < 8) return 1;
  if (h < 11) return 2;
  if (h < 16) return 3;
  if (h < 19) return 4;
  return 5;
}

// pressure state -> arrow shown on the compact pressure chip (v3.192)
export const PS_ARROW = { fastFall: "↓↓", slowFall: "↓", stable: "→", slowRise: "↑", fastRise: "↑↑", high: "→" };

/** the "where and when" block: { items: [{ id, h, text }], note } */
export function buildWhere({ zone, season, now, t }) {
  const hour = now.getHours();
  const time = String(hour).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const rating = PHASE_RATING[season][phaseIndex(hour)];
  return {
    items: [
      { id: "relief", h: t("fa.w.h.relief"), text: t("fa.w.rel." + zone) },
      { id: "bottom", h: t("fa.w.h.bottom"), text: t("fa.w.bot." + season) },
      { id: "edge", h: t("fa.w.h.edge"), text: t("fa.w.edge") },
      { id: "time", h: t("fa.w.h.time"), text: t("fa.w.time." + season) + " " + fmt(t("fa.w.now." + rating), { time }) },
    ],
    note: t("fa.w.note"),
  };
}

/**
 * kind: "start" (session start) | "change" (after a catch) | "dry" (10 casts
 * without a catch) | "manual" (the "Съвет" button, v3.183: like "start" — a fresh
 * analysis of the current weather, no comparison with an earlier reading). prev = the reading the last advice was based on.
 * extra = { history (48 h hourly readings) }.
 * Returns null for "change" when nothing changed drastically.
 */
export function buildAdvice({ kind, prev, cur, t, extra = {} }) {
  const month = new Date().getMonth();
  const dec = t("fa.dec") === "fa.dec" ? "." : t("fa.dec");
  const n = (v) => String(r1(v)).replace(".", dec);
  const airD24 = airChange24(extra.history);
  const r = rateConditions(cur, { month, airD24 });
  const changes = kind === "start" || kind === "manual" ? [] : detectChanges(prev, cur, t, n);
  if (kind === "change" && changes.length === 0) return null;

  const zone = decideZone(r, cur, month);
  const w = cur.water_temperature;
  const hot = w != null && w > 24;
  const dirLabel = cur.wind_direction != null ? t("compass." + compassKey(cur.wind_direction)) : "";

  // what the pressure / the wind did to the verdict, as a short clause
  const effText = (who) => {
    const asked = zone.asked[who];
    const e = effectOf(asked, who === "press" ? zone.z0 : zone.z1, who === "press" ? zone.z1 : zone.z2);
    if (e === "none") return t("fa.eff.none");
    if (e === "shift") return t(asked > 0 ? "fa.eff.shiftDeep" : "fa.eff.shiftNear");
    if (e === "agree") return t(asked > 0 ? "fa.eff.agreeDeep" : "fa.eff.agreeNear");
    return t("fa.eff.limited");
  };

  // ---- 1. temperature (the most important) --------------------------------
  let tempText = "";
  if (r.tc) {
    tempText = fmt(t("fa.a.t." + r.tc), { w: n(w), a: cur.air_temperature != null ? n(cur.air_temperature) : "—" });
  } else if (cur.air_temperature != null) {
    tempText = fmt(t("fa.a.t.noWater"), { a: n(cur.air_temperature) });
  }
  if (tempText && airD24 != null && Math.abs(airD24) >= 3) {
    const key = airD24 < 0 ? (hot ? "fa.a.airDownHot" : "fa.a.airDown") : hot ? "fa.a.airUpHot" : "fa.a.airUp";
    tempText += " " + fmt(t(key), { d: n(Math.abs(airD24)) });
  }

  // ---- 2. pressure ----------------------------------------------------------
  let pressText = "";
  if (cur.air_pressure != null) {
    const d3 = cur.pressure_trend;
    let trend = "";
    if (d3 != null) {
      const tk = d3 <= -1 ? "fall" : d3 >= 1 ? "rise" : "flat";
      trend = " — " + fmt(t("fa.a.pTrend." + tk), { d: (d3 > 0 ? "+" : d3 < 0 ? "−" : "") + n(Math.abs(d3)) });
    }
    const stateKey = r.ps === "stable" && cur.air_pressure < 1005 ? "stableLow" : r.ps;
    pressText = fmt(t("fa.a.p"), { v: r0(cur.air_pressure), trend }) + " " + t("fa.a.p." + stateKey) + " " + effText("press");
  }

  // ---- 3. wind ----------------------------------------------------------------
  let windText = "";
  if (cur.wind_speed != null) {
    const bank = cur.wind_direction != null ? t("fa.bank." + waveBank(cur.wind_direction)) : "";
    let key;
    if (r.wc === "calm") key = isSummer(month) ? "fa.a.w.calmSummer" : "fa.a.w.calm";
    else if (r.wc === "strong") key = "fa.a.w.strong";
    else if (cur.wind_speed < 2) key = "fa.a.w.light";
    else if (cur.wind_direction == null) key = "fa.a.w.noBank";
    else key = r.waves ? "fa.a.w.on" : w != null && w > 26 ? "fa.a.w.onHot" : "fa.a.w.onCold";
    windText = fmt(t(key), { v: n(cur.wind_speed), dir: dirLabel || "—", bank });
    if (cur.wind_speed >= 2 && cur.wind_direction != null && r.dc !== "neutral") {
      windText += " " + fmt(t(r.dc === "good" ? "fa.a.dirWarm" : "fa.a.dirCool"), { dir: dirLabel });
    }
    windText += " " + effText("wind");
  }

  // ---- conclusion: ONE recommendation + which factor decided it ----------------
  let conclusion = t(["fa.z.near", "fa.z.mid", "fa.z.deep"][zone.zone]);
  // which way to cast: toward the bank the waves hit (only when the verdict is not "far/deep")
  if (r.waves && zone.zone <= 1) conclusion += " " + fmt(t("fa.z.waveNear"), { bank: t("fa.bank." + waveBank(cur.wind_direction)) });
  const moved = zone.z1 !== zone.z0 || zone.z2 !== zone.z1;
  conclusion += " " + t(zone.locked ? "fa.z.d.locked" : moved ? "fa.z.d.adjust" : "fa.z.d.base");

  // ---- chips (tap -> the 48 h chart) -----------------------------------------
  // v3.192 — compact: no label words (the icon says what it is), so all three fit on one row
  const chips = [];
  if (cur.air_temperature != null || w != null) {
    chips.push({
      id: "temp",
      text:
        cur.air_temperature != null && w != null
          ? fmt(t("fa.chip.s.temp"), { a: r0(cur.air_temperature), w: r0(w) })
          : cur.air_temperature != null
            ? fmt(t("fa.chip.s.air"), { a: r0(cur.air_temperature) })
            : fmt(t("fa.chip.water"), { w: r0(w) }),
    });
  }
  if (cur.air_pressure != null) chips.push({ id: "press", text: fmt(t("fa.chip.s.press"), { v: r0(cur.air_pressure), s: PS_ARROW[r.ps] || "" }) });
  if (cur.wind_speed != null) chips.push({ id: "wind", text: fmt(t("fa.chip.s.wind"), { v: n(cur.wind_speed), dir: dirLabel && cur.wind_speed >= 1 ? " " + dirLabel : "" }) });

  const lines = [];
  if (tempText) lines.push({ id: "temp", text: tempText });
  if (pressText) lines.push({ id: "press", text: pressText });
  if (windText) lines.push({ id: "wind", text: windText });

  // v3.190 — relief / bottom type / time of day for the season and the zone verdict
  const where = buildWhere({ zone: zone.zone, season: habitatSeason(month, w), now: extra.now ? new Date(extra.now) : new Date(), t });

  return {
    level: r.level,
    score: r.score,
    activity: fmt(t("fa.activity"), { level: t("fa.level." + r.level), score: r.score }),
    chips,
    intro: kind === "dry" ? t("fa.dry.intro") : "",
    changes,
    noChange: kind === "dry" && changes.length === 0 ? t("fa.dry.noChange") : "",
    lines,
    where,
    conclusion,
  };
}
