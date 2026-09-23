// v3.47 — user-controlled battery-saving preferences, persisted to
// localStorage. Currently holds just one: whether the screen should be
// kept awake (Wake Lock) automatically while a rod timer is running on
// "Активна сесия" (see useRodTimerMonitor.js). A tiny pub-sub module (same
// shape as sessionStore.js's own listeners/subscribe pair) rather than a
// React Context, since only two independent parts of the tree need it —
// Profile.jsx (the toggle itself) and useRodTimerMonitor.js (which reads
// it to decide whether to acquire the lock) — and they aren't nested
// inside one another.
const KEEP_SCREEN_AWAKE_KEY = "catchcount_keep_screen_awake";

let keepScreenAwakeListeners = new Set();

// Default is OFF: a running rod timer's reminder (beep, vibration, and — if
// permission was granted — a real system notification) already fires
// reliably even with the screen off or the phone locked, via beep.js's
// Web-Audio-clock scheduling (see the v2.45 note in useRodTimerMonitor.js)
// — the screen was never actually REQUIRED for the reminder to work, only
// for watching the live countdown without unlocking the phone. Since
// keeping the screen lit is by far the single biggest battery draw during
// a multi-hour fishing session (much more than GPS or network — see
// claude/battery-audit-3.47.md), defaulting this OFF is what actually
// fixes "the phone died mid-session" without giving up anything the
// reminder itself needs. Anyone who prefers the old always-lit behaviour
// can switch it back on in Профил.
export function getKeepScreenAwake() {
  try {
    return localStorage.getItem(KEEP_SCREEN_AWAKE_KEY) === "true";
  } catch (e) {
    return false;
  }
}

export function setKeepScreenAwake(value) {
  try {
    localStorage.setItem(KEEP_SCREEN_AWAKE_KEY, value ? "true" : "false");
  } catch (e) {
    console.error("setKeepScreenAwake error:", e);
  }
  keepScreenAwakeListeners.forEach((l) => l(!!value));
}

export function subscribeKeepScreenAwake(listener) {
  keepScreenAwakeListeners.add(listener);
  return () => keepScreenAwakeListeners.delete(listener);
}
