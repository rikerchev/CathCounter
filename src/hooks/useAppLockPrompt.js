import { useCallback, useState } from "react";

// v3.39 — drives the "lock the app while fishing" dialog
// (src/components/AppLockPrompt.jsx). There is no web/PWA API that lets a
// site put itself into Android's "App pinning" or iOS's "Guided Access" —
// both are deliberately user-only OS features (otherwise any website could
// trap someone in it), so this can only ever walk the user through doing it
// themselves. See claude/app-lock-prompt-3.39.md for the full writeup.
const DISMISS_KEY = "appLockPromptDismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — same one useInstallPrompt.js already relies on.
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua) && !window.MSStream) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Only meaningful once actually installed (App pinning / Guided Access lock
 * you into whatever app/tab is currently open — pointless to suggest from a
 * random browser tab) and only on a platform that actually HAS one of these
 * OS features. Desktop has neither, so it's simply never offered there.
 */
export function useAppLockPrompt() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [open, setOpen] = useState(false);
  const platform = detectPlatform();
  const eligible = isStandalone() && (platform === "android" || platform === "ios");

  // Any way of closing the dialog (the "Разбрах" button, the corner ✕,
  // Escape, or tapping outside it) counts as "seen" — there's no reliable
  // way to detect whether the user actually followed the steps, and the
  // user's own explicit ask was "show it once; if skipped, let me bring it
  // back myself from Profile" rather than nagging again on the next cast.
  const dismiss = useCallback(() => {
    setDismissed(true);
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  // Profile.jsx's "show instructions" button: clears the permanent
  // dismissal and opens the dialog right away.
  const showAgain = useCallback(() => {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
    setDismissed(false);
    setOpen(true);
  }, []);

  return { eligible, dismissed, open, setOpen, dismiss, showAgain, platform };
}
