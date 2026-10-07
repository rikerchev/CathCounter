// v3.108 — local-first repository for rod casts: one row per press of
// "Старт" (src/components/RodTimer.jsx's handleStart), independent of
// whether that cast ever lands a fish or gets cancelled. Mirrors
// catchRepository.js's local-first shape, but much simpler — a cast is a
// pure append-only event, never edited or deleted once logged, so there is
// no update/delete path here.
import { getAllRodCasts, saveRodCastLocal } from "@/lib/localDb";

// v3.109 — sessionStartTime is the LIVE session's own start timestamp
// (sessionStore.js's state.sessionStartTime — set the moment the very
// first rod is started, wiped back to null on closeSession()), passed in
// by the caller (RodTimer.jsx, right after it calls
// sessionStore.startRodTimer, which is what establishes it for a brand-new
// session). Tagging the cast with it is what lets
// sessions.js's assignCastsToSessions() refuse to attribute a cast back to
// a catch from an earlier, already-closed session — see that function's
// own comment for the bug this fixes.
//
// v3.111 — no longer triggers a sync here (used to call pushOnly() on
// every press). Casts are low priority and can be dozens per session, so
// pushing each one the instant it's logged was waking the radio for no
// real benefit — see syncEngine.js's pushPendingRodCasts(), which now
// defers all rod-cast pushing until the session is no longer active and
// picks these up then instead (session close already triggers a
// pushOnly()/syncAll() in ActiveSession.jsx).
export async function logRodCast(rod, sessionStartTime) {
  return saveRodCastLocal({
    rod,
    date: new Date().toISOString(),
    session_start: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
    _synced: false,
  });
}

export async function listRodCastsByUser(userId) {
  const casts = await getAllRodCasts();
  return casts.filter(c => !userId || !c.created_by_id || c.created_by_id === userId);
}
