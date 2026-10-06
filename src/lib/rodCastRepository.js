// v3.108 — local-first repository for rod casts: one row per press of
// "Старт" (src/components/RodTimer.jsx's handleStart), independent of
// whether that cast ever lands a fish or gets cancelled. Mirrors
// catchRepository.js's local-first shape, but much simpler — a cast is a
// pure append-only event, never edited or deleted once logged, so there is
// no update/delete path here.
import { getAllRodCasts, saveRodCastLocal } from "@/lib/localDb";
import { pushOnly } from "@/lib/syncEngine";

// v3.109 — sessionStartTime is the LIVE session's own start timestamp
// (sessionStore.js's state.sessionStartTime — set the moment the very
// first rod is started, wiped back to null on closeSession()), passed in
// by the caller (RodTimer.jsx, right after it calls
// sessionStore.startRodTimer, which is what establishes it for a brand-new
// session). Tagging the cast with it is what lets
// sessions.js's assignCastsToSessions() refuse to attribute a cast back to
// a catch from an earlier, already-closed session — see that function's
// own comment for the bug this fixes.
export async function logRodCast(rod, sessionStartTime) {
  const saved = await saveRodCastLocal({
    rod,
    date: new Date().toISOString(),
    session_start: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
    _synced: false,
  });
  // Push-only: fast, no full pull — the handler that calls this (RodTimer's
  // handleStart) must not wait on the network before the timer starts.
  pushOnly();
  return saved;
}

export async function listRodCastsByUser(userId) {
  const casts = await getAllRodCasts();
  return casts.filter(c => !userId || !c.created_by_id || c.created_by_id === userId);
}
