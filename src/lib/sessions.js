// Shared "fishing session" grouping — a session is just consecutive catches
// close together in time (there is no separate stored session record, see
// src/pages/Sessions.jsx and src/lib/dataPortability.js). Extracted here so
// Sessions.jsx (the UI) and the backup/export code (src/lib/photoNaming.js)
// use the exact same rule instead of two copies that could drift apart.
import { parseCatchDate } from "@/lib/dateUtils";

export const SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Groups catches into sessions: sorts chronologically, starts a new session
 * whenever the gap to the previous catch exceeds SESSION_GAP_MS. Returns
 * sessions in ascending (oldest-first) order, so a session's index+1 makes
 * a stable "session number" — new sessions only ever append, never
 * renumber earlier ones.
 */
export function groupCatchesIntoSessions(catches) {
  if (!catches.length) return [];
  const sorted = [...catches].sort((a, b) => parseCatchDate(a).getTime() - parseCatchDate(b).getTime());
  const sessions = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prevDate = parseCatchDate(sorted[i - 1]).getTime();
    const currDate = parseCatchDate(sorted[i]).getTime();
    if (currDate - prevDate > SESSION_GAP_MS) {
      sessions.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  sessions.push(current);
  return sessions;
}

/** { catchId -> 1-based session number } for one user's catches. */
export function sessionNumbersByCatchId(catches) {
  const sessions = groupCatchesIntoSessions(catches);
  const map = new Map();
  sessions.forEach((session, i) => {
    for (const c of session) map.set(c.id, i + 1);
  });
  return map;
}

// v3.108 — attributes each rod-cast event (src/lib/rodCastRepository.js; one
// row per press of "Старт", win or not) to the session of its
// nearest-in-time catch, as long as that catch is within SESSION_GAP_MS —
// the same gap sessions themselves are built from. There is no separate
// stored "session" record (see this file's own header comment), so a cast
// with no catch anywhere near it — an outing that caught nothing — isn't
// part of any session under this app's catch-only session model, exactly
// like such an outing produces no session card at all today; it's left out
// rather than inventing a catch-less session for it.
//
// Returns a Map<sessionNumber (1-based, same numbering as
// sessionNumbersByCatchId), RodCast[]>.
export function assignCastsToSessions(catches, casts) {
  const result = new Map();
  if (!catches.length || !casts.length) return result;

  const sessionByCatchId = sessionNumbersByCatchId(catches);
  const catchTimes = catches.map((c) => ({ id: c.id, t: parseCatchDate(c).getTime() }));

  for (const cast of casts) {
    const t = new Date(cast.date).getTime();
    if (isNaN(t)) continue;
    let nearest = null;
    let nearestDist = Infinity;
    for (const ct of catchTimes) {
      const d = Math.abs(ct.t - t);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = ct;
      }
    }
    if (nearest && nearestDist <= SESSION_GAP_MS) {
      const sessionNumber = sessionByCatchId.get(nearest.id);
      if (!result.has(sessionNumber)) result.set(sessionNumber, []);
      result.get(sessionNumber).push(cast);
    }
  }
  return result;
}
