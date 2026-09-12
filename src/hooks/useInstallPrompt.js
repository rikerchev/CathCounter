import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { getDeferredPrompt, clearDeferredPrompt, subscribe } from "@/lib/pwaInstallBus";

const DISMISS_KEY = "installPromptDismissedAt";
const DISMISS_DAYS = 14;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — it never fires beforeinstallprompt or reports
    // display-mode via matchMedia the same way Chrome does.
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Drives the "install the app" banner (src/components/InstallAppBanner.jsx).
 *
 * The whole point: manifest.json already declares display:standalone, so
 * once the app is added to the home screen, the browser's own address bar
 * is gone entirely — that's the only fix that works the same on every
 * device, unlike a per-browser setting the user can't set on someone else's
 * phone.
 *
 * `deferredPrompt` comes from src/lib/pwaInstallBus.js, which starts
 * listening for `beforeinstallprompt` at module-load time (imported first
 * thing in main.jsx) — not from a listener attached here in a useEffect —
 * so we still catch the event even if Chrome fires it before this hook's
 * component ever mounts (e.g. before <Layout> renders).
 *
 * canShow is intentionally NOT gated on "do we already have a deferred
 * prompt". A button that only appears once Chrome has decided to hand us
 * the event is invisible for anyone Chrome hasn't made that decision for
 * yet — or ever, e.g. once an origin is marked "already installed", which
 * is sticky per-origin in Chrome and can outlive the user removing the
 * home-screen icon (only a full Settings → Apps → Uninstall resets it).
 * No page code can force that event to fire. So instead the button is
 * always offered to any not-yet-installed, not-dismissed visitor;
 * promptInstall() reports back whether it actually had a native prompt to
 * trigger, so the banner can react instead of the button silently doing
 * nothing (see InstallAppBanner.jsx).
 */
export function useInstallPrompt() {
  const deferredPrompt = useSyncExternalStore(subscribe, getDeferredPrompt, () => null);
  const [dismissed, setDismissed] = useState(wasDismissedRecently);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handleInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", handleInstalled);
    return () => window.removeEventListener("appinstalled", handleInstalled);
  }, []);

  const ios = isIos();
  const canShow = !installed && !dismissed;

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore — user dismissed the native dialog
    }
    clearDeferredPrompt();
    return "prompted";
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  return {
    canShow,
    isIos: ios,
    canPromptNatively: !!deferredPrompt,
    promptInstall,
    dismiss,
  };
}
