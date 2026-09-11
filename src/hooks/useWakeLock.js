import { useEffect, useCallback, useRef } from "react";

/**
 * useWakeLock — keeps the screen on while `active` is true.
 * Does NOT release on visibility change to hidden; only re-acquires
 * when the page becomes visible again. The screen stays awake as long
 * as a timer is running, unless the user manually locks the phone.
 */
export function useWakeLock(active) {
  const sentinelRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const release = useCallback(() => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      sentinelRef.current.release();
    }
    sentinelRef.current = null;
  }, []);

  const acquire = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    if (!activeRef.current) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // User agent may reject (e.g. low battery) — ignore.
    }
  }, []);

  useEffect(() => {
    if (!active) {
      release();
      return;
    }

    acquire();
    const onVisibility = () => {
      if (!document.hidden && active) {
        acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, acquire, release]);

  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  return { supported };
}