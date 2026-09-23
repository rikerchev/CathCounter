import { useCallback, useState } from "react";

// v3.41 — drives BatteryOptimizationPrompt.jsx. Separate from
// useAppLockPrompt.js on purpose (different topic — battery optimization
// exemption, not App Pinning/Guided Access — and left independent so this
// doesn't touch that file at all). See
// claude/battery-optimization-prompt-3.41.md for the full writeup.
//
// Android only: iOS has no per-app "exempt from background battery
// restrictions" setting at all — its background execution model doesn't
// expose an equivalent toggle to the user, so there is nothing to point an
// iPhone user at here.
const DISMISS_KEY = "batteryPromptDismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent || "");
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function useBatteryPrompt() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [open, setOpen] = useState(false);
  const eligible = isStandalone() && isAndroid();

  const dismiss = useCallback(() => {
    setDismissed(true);
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const showAgain = useCallback(() => {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
    setDismissed(false);
    setOpen(true);
  }, []);

  return { eligible, dismissed, open, setOpen, dismiss, showAgain };
}
