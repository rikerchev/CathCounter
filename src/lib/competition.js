// v3.158 — "Състезание" mode of the live session.
//
// The angler enters up to four times of day: when the settling-in at the boxes
// starts, when the heavy groundbait starts, when the race starts and when it
// ends. Each stage lasts until the NEXT entered time (the race until the end
// time), so three stages come out of four times:
//   settle: settle -> heavy,  heavy: heavy -> start,  race: start -> end.
//
// The state only keeps "HH:MM" strings plus the local midnight of the day they
// were entered for (baseDay); timestamps are derived here, so a time earlier
// than the previous one simply means "after midnight".

export const COMP_KEYS = ["settle", "heavy", "start", "end"];
export const MAX_COMPETITION_RODS = 6;

export function defaultCompetition() {
  return {
    enabled: false,
    baseDay: null, // ms of the local midnight the first time belongs to
    hm: { settle: "", heavy: "", start: "", end: "" },
    activeRodId: 1,
  };
}

function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return [h, mi];
}

// Local midnight of the day a freshly entered first time belongs to: today,
// unless that time is already more than 12 h in the past (entered the evening
// before for tomorrow's race).
export function pickBaseDay(hm, now = Date.now()) {
  const p = parseHm(hm);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (p) {
    const t = new Date(d);
    t.setHours(p[0], p[1], 0, 0);
    if (t.getTime() < now - 12 * 3600 * 1000) d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

export function resolveTimes(c) {
  const out = { settle: null, heavy: null, start: null, end: null };
  if (!c || !c.baseDay) return out;
  let dayOffset = 0;
  let prev = null;
  for (const k of COMP_KEYS) {
    const p = parseHm(c.hm && c.hm[k]);
    if (!p) continue;
    let ts;
    for (;;) {
      const d = new Date(c.baseDay);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(p[0], p[1], 0, 0);
      ts = d.getTime();
      if (prev == null || ts >= prev || dayOffset >= 2) break;
      dayOffset++;
    }
    out[k] = ts;
    prev = ts;
  }
  return out;
}

const SEGMENTS = [
  { key: "settle", from: "settle", to: "heavy" },
  { key: "heavy", from: "heavy", to: "start" },
  { key: "race", from: "start", to: "end" },
];

export function getStageInfo(times, now = Date.now()) {
  const segs = SEGMENTS.map((s) => ({ key: s.key, from: times[s.from], to: times[s.to] }));
  const valid = segs.filter((s) => s.from != null && s.to != null);
  const active = valid.find((s) => now >= s.from && now < s.to) || null;
  const upcoming = valid.filter((s) => s.from > now).sort((a, b) => a.from - b.from)[0] || null;
  const end = times.end;
  return {
    segs,
    active,
    upcoming,
    finished: end != null && now >= end,
    raceEndRemaining: end != null && now < end ? end - now : null,
    anyTimes: valid.length > 0 || end != null,
  };
}

// Moments that get a sound: every entered time (the start of the next stage,
// and the end of the competition).
export function getBoundaries(times) {
  const counts = { settle: 3, heavy: 3, start: 3, end: 5 };
  return COMP_KEYS.filter((k) => times[k] != null).map((k) => ({ key: k, ts: times[k], count: counts[k] }));
}

export function formatClock(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
