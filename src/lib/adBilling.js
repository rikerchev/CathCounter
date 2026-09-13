/**
 * Ad billing period helper.
 *
 * Rule confirmed with the site owner (Sep 2026): whatever is left of the
 * calendar month an ad is activated in is a free trial — the paid period
 * is a whole number of FULL calendar months starting on the 1st of the
 * following month.
 *
 *   Activated 15 Oct, duration 12 months
 *     → 15–31 Oct free, paid period 1 Nov – 31 Oct (the following year)
 *
 * Dates are plain "YYYY-MM-DD" strings throughout (no time-of-day/timezone
 * component), matching every other date field in this app (see
 * server/schema/schema.sql — `date TEXT`, `end_date TEXT`, etc.).
 */

/**
 * @param {string} startsAt - "YYYY-MM-DD" activation date
 * @param {number|string|null|undefined} durationMonths
 * @returns {string|null} "YYYY-MM-DD" — the last paid day, or null if either
 *   input is missing/invalid (meaning: no expiry tracked for this ad)
 */
export function computeAdExpiry(startsAt, durationMonths) {
  const months = Number(durationMonths);
  if (!startsAt || !months || months <= 0) return null;
  const parts = String(startsAt).split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  // JS Date month is 0-indexed; day 0 of month X = the last day of month
  // X-1. The last paid month, 0-indexed, is (m-1) + months — so day 0 of
  // the month right after that gives us its last day.
  const expiry = new Date(Date.UTC(y, (m - 1) + months + 1, 0));
  return expiry.toISOString().slice(0, 10);
}

/**
 * Whole days from today until (and including) the given "YYYY-MM-DD" date —
 * negative once it's in the past. Used to decide when a renewal/expiry
 * notice is due and to color-code the expiry display in the admin UI.
 */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const targetUTC = Date.UTC(y, (m || 1) - 1, d || 1);
  return Math.round((targetUTC - todayUTC) / 86400000);
}
