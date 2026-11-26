// Fish-activity forecast for the carp family (carp, crucian, bream, grass carp).
// v3.174 — turns the weather readings from src/lib/weather.js into (1) an
// expected-activity rating, (2) a short explanation of WHAT CHANGED and (3)
// where/how to fish (depth / distance / which bank). Pure functions; all
// texts come from the translation files (keys "fa.*" and "compass.*").
//
// Rules (from the angling guidance the app's author supplied):
//  - pressure: stable, or slowly falling, is best; a sharp fall or rise (or very
//    high pressure) switches the fish off and sends it to the bottom / cover;
//  - wind: 2-5 m/s is ideal, S/SW/W warms, N/NE/E cools, a flat calm in summer
//    starves the water of oxygen; the fish gather on the bank the wind blows to;
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
  if (w < 18) return "cool";
  if (w <= 26) return "optimal";
  return "hot";
}

/**
 * c = { air_pressure, pressure_trend, wind_speed, wind_direction, water_temperature }
 * -> { score 0..100, level, ps, wc, dc, tc }
 */
export function rateConditions(c, month = new Date().getMonth()) {
  const ps = pressureState(c.air_pressure, c.pressure_trend);
  const wc = windClass(c.wind_speed);
  const dc = dirClass(c.wind_direction, c.wind_speed);
  const tc = waterClass(c.water_temperature);
  const summer = month >= 5 && month <= 7;

  let s = 0;
  s += { slowFall: 40, stable: 34, slowRise: 28, high: 14, fastRise: 10, fastFall: 8 }[ps];
  s += wc == null ? 12 : { calm: summer ? 5 : 11, ok: 20, strong: 3 }[wc] * 1;
  if (wc === "ok" && c.wind_speed < 2) s -= 5; // very light
  s += { good: 15, neutral: 9, bad: 3 }[dc];
  const w = c.water_temperature;
  if (w == null) s += 14;
  else if (w >= 18 && w <= 24) s += 25;
  else if ((w >= 15 && w < 18) || (w > 24 && w <= 26)) s += 19;
  else if (w >= 10 && w < 15) s += 13;
  else if (w > 26 && w <= 28) s += 12;
  else if (w >= 8 && w < 10) s += 7;
  else if (w > 28) s += 6;
  else s += 3;

  const score = Math.max(0, Math.min(100, Math.round(s)));
  const level = score >= 80 ? "high" : score >= 62 ? "good" : score >= 42 ? "medium" : "low";
  return { score, level, ps, wc, dc, tc };
}

/** Lines describing what changed between two readings (only the drastic ones). */
function detectChanges(prev, cur, t) {
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
      out.push(fmt(t(d < 0 ? "fa.chg.tFall" : "fa.chg.tRise"), { from: r1(prev.air_temperature), to: r1(cur.air_temperature) }));
    }
  }
  if (cur.wind_speed != null && prev.wind_speed != null) {
    const d = cur.wind_speed - prev.wind_speed;
    if (Math.abs(d) >= 3) {
      out.push(fmt(t(d > 0 ? "fa.chg.wUp" : "fa.chg.wDown"), { from: r1(prev.wind_speed), to: r1(cur.wind_speed) }));
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

// depth tendency: >0 deeper / farther out, <0 shallower / closer in
function depthTendency(r, cur, prev, summer) {
  let d = 0;
  d += { slowFall: -2, fastFall: 2, fastRise: 2, high: 2, slowRise: 0, stable: 0 }[r.ps];
  d += { cold: 1, cool: -1, optimal: 0, hot: 2 }[r.tc] || 0;
  if (r.wc === "strong") d += 1;
  if (r.wc === "calm" && summer) d += 1;
  if (r.dc === "bad") d += 1;
  if (prev && cur && cur.air_temperature != null && prev.air_temperature != null) {
    const dt = cur.air_temperature - prev.air_temperature;
    if (dt <= -4) d += 1;
    else if (dt >= 4 && r.tc !== "hot") d -= 1;
  }
  return d;
}

/**
 * kind: "start" (session start) | "change" (after a catch) | "dry" (10 casts
 * without a catch). prev = the reading the last advice was based on.
 * Returns null for "change" when nothing changed drastically.
 */
export function buildAdvice({ kind, prev, cur, t }) {
  const month = new Date().getMonth();
  const summer = month >= 5 && month <= 7;
  const r = rateConditions(cur, month);
  const changes = kind === "start" ? [] : detectChanges(prev, cur, t);
  if (kind === "change" && changes.length === 0) return null;

  const lines = [];
  lines.push(t("fa.p." + r.ps));

  const dirLabel = cur.wind_direction != null ? t("compass." + compassKey(cur.wind_direction)) : "";
  if (r.wc === "calm") lines.push(t("fa.w.calm"));
  else if (r.wc === "strong") lines.push(fmt(t("fa.w.strong"), { v: r1(cur.wind_speed) }));
  else if (r.wc === "ok") lines.push(fmt(t("fa.w.ok"), { v: r1(cur.wind_speed), dir: dirLabel || "—" }));
  if (r.dc === "bad") lines.push(fmt(t("fa.w.dirBad"), { dir: dirLabel }));
  else if (r.dc === "good") lines.push(fmt(t("fa.w.dirGood"), { dir: dirLabel }));
  if (cur.wind_speed != null && cur.wind_speed >= 2 && cur.wind_direction != null) {
    lines.push(fmt(t("fa.w.bank"), { to: t("compass." + compassKey(cur.wind_direction + 180)) }));
  }
  const dt = depthTendency(r, cur, prev, summer);
  if (r.tc) {
    // cool water normally means "shallow, sun-warmed bays" — but when the pressure sends the
    // fish deeper, say that feeding is just sluggish instead of contradicting the advice
    const key = r.tc === "cool" && dt >= 1 ? "fa.t.coolDeep" : "fa.t." + r.tc;
    lines.push(fmt(t(key), { v: r1(cur.water_temperature) }));
  }
  const action = dt >= 1 ? "fa.act.deeper" : dt <= -1 ? "fa.act.shallower" : "fa.act.same";

  // current readings, one line
  const parts = [];
  if (cur.air_pressure != null) {
    parts.push(
      cur.pressure_trend != null
        ? fmt(t("fa.now.pressure"), { v: r0(cur.air_pressure), d: (cur.pressure_trend > 0 ? "+" : "") + r1(cur.pressure_trend) })
        : fmt(t("fa.now.pressureNoTrend"), { v: r0(cur.air_pressure) }),
    );
  }
  if (cur.wind_speed != null) parts.push(fmt(t("fa.now.wind"), { v: r1(cur.wind_speed), dir: dirLabel }).trim());
  if (cur.air_temperature != null) parts.push(fmt(t("fa.now.air"), { v: r1(cur.air_temperature) }));
  if (cur.water_temperature != null) parts.push(fmt(t("fa.now.water"), { v: r1(cur.water_temperature) }));

  let intro = "";
  if (kind === "dry") intro = t("fa.dry.intro");
  const noChange = kind === "dry" && changes.length === 0 ? t("fa.dry.noChange") : "";

  return {
    level: r.level,
    score: r.score,
    activity: fmt(t("fa.activity"), { level: t("fa.level." + r.level), score: r.score }),
    now: parts.join(" · "),
    intro,
    changes,
    noChange,
    lines,
    action: t(action),
  };
}
