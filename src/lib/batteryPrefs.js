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

// v3.47 defaulted this OFF, on the assumption that beep.js's Web-Audio-clock
// scheduling (see the v2.45 note in useRodTimerMonitor.js) makes the screen
// unnecessary for the reminder to fire. v3.78 — a real-world session proved
// that assumption wrong: the screen turned off on its own from inactivity
// (Wake Lock was off), and the reminder did NOT sound. Whatever the exact
// cause on that phone (OS-level throttling of the audio clock once the tab
// is fully backgrounded, battery-optimization killing it, or something
// device-specific), the practical fix is the same: don't let the screen
// turn off from inactivity in the first place, so the page never gets
// backgrounded that way at all. Defaulting back to ON is what actually
// guarantees the reminder is seen/heard for anyone who hasn't touched this
// setting. Anyone who explicitly prefers to save battery and accepts the
// (device-dependent) risk of a missed reminder can still turn it off in
// Профил.
export function getKeepScreenAwake() {
  try {
    const stored = localStorage.getItem(KEEP_SCREEN_AWAKE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch (e) {
    return true;
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
