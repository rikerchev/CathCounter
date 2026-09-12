import { useState, useEffect, useCallback } from "react";

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
 * phone. Chrome/Edge/Android fire `beforeinstallprompt`, which lets us show
 * our own "Install" button and trigger the native install flow
 * programmatically. iOS Safari never fires that event and has no equivalent
 * API — there we just show the manual "Share → Add to Home Screen" steps.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(wasDismissedRecently);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const ios = isIos();
  // Android/desktop: only worth showing once Chrome has actually offered the
  // native prompt (some visits it doesn't, e.g. criteria not met yet). iOS:
  // that event never exists, so show the manual instructions instead as
  // long as the app isn't already installed.
  const canShow = !installed && !dismissed && (deferredPrompt != null || ios);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore — user dismissed the native dialog
    }
    setDeferredPrompt(null);
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
