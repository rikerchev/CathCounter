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

// v3.112 — second battery-saving preference, same shape as the one above.
// The reminder alarm (useRodTimerMonitor.js, beep.js) normally plays ONE
// BEEP PER REMINDER MINUTE (count = timer.reminderMinutes) — a 20-minute
// reminder beeps 20 times, spaced ~0.8s apart, so roughly 16-18 seconds of
// continuous Web Audio output; a 60-minute reminder runs for the better
// part of a minute. That's real, measurable battery/energy cost (the audio
// output stays active for the whole sequence — see beep.js's own note on
// the audio clock deliberately running through a locked screen), and it
// scales with the reminder length with no upper bound. Defaults OFF —
// unlike keepScreenAwake above, this changes what the reminder actually
// sounds like, not just a background battery optimization, so existing
// users keep hearing exactly what they always have unless they opt in.
const SINGLE_BEEP_ALERT_KEY = "catchcount_single_beep_alert";

let singleBeepAlertListeners = new Set();

export function getSingleBeepAlert() {
  try {
    return localStorage.getItem(SINGLE_BEEP_ALERT_KEY) === "true";
  } catch (e) {
    return false;
  }
}

export function setSingleBeepAlert(value) {
  try {
    localStorage.setItem(SINGLE_BEEP_ALERT_KEY, value ? "true" : "false");
  } catch (e) {
    console.error("setSingleBeepAlert error:", e);
  }
  singleBeepAlertListeners.forEach((l) => l(!!value));
}

export function subscribeSingleBeepAlert(listener) {
  singleBeepAlertListeners.add(listener);
  return () => singleBeepAlertListeners.delete(listener);
}
