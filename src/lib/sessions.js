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
