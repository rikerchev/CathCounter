// Captures the browser's `beforeinstallprompt` event as early as possible —
// at MODULE LOAD TIME (imported at the very top of main.jsx, before React
// even mounts) — instead of inside a component's useEffect.
//
// Why this matters: Chrome fires `beforeinstallprompt` as soon as it decides
// the page is installable, which can happen very early in the page's life —
// sometimes before React has rendered anything, let alone before a hook
// buried inside <Layout> has had a chance to attach its own listener. A
// listener added late simply misses the event forever for that page load,
// which looked identical to "Chrome refuses to offer install" even on
// devices where Chrome was perfectly willing to fire it.
//
// This module is a tiny pub/sub "bus": it grabs the event the moment it
// fires (whenever that is) and hands it to any hook/component that asks,
// even ones that mount after the event already happened.
//
// This does NOT change the separate, platform-level limitation: once Chrome
// has decided a given origin is "already installed" (tracked per-origin,
// independent of whether a home-screen icon still exists), it will not fire
// `beforeinstallprompt` again at all — no page code, early or late, can make
// that event happen. The only way to reset that is Android
// Settings → Apps → uninstall the app's WebAPK, or Chrome's own
// Settings → Site settings → "Clear & reset" for the site.

let deferredEvent = null;
let installedFlag = false;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // a subscriber throwing shouldn't break the others
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredEvent = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredEvent = null;
    notify();
  });
}

export function getDeferredPrompt() {
  return deferredEvent;
}

export function clearDeferredPrompt() {
  deferredEvent = null;
  notify();
}

export function wasInstalledEventSeen() {
  return installedFlag;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
