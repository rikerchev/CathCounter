import { useEffect, useState } from "react";
import * as sessionStore from "@/lib/sessionStore";
import { playBeeps, stopBeeps } from "@/lib/beep";
import { useWakeLock } from "@/hooks/useWakeLock";

/**
 * useRodTimerMonitor — globally monitors all running rod timers.
 * When a rod's reminder expires, plays one beep per elapsed minute
 * (count = reminderMinutes). Uses the stored reminderBeepsPlayed flag
 * so extending the reminder time (setRodReminder resets it) lets
 * beeps fire again on the next expiry. Beeps are NOT cancelled
 * mid-sequence — they play out fully.
 *
 * Battery note: this hook is mounted in Layout, so it used to run a
 * 1-second poll on every single page of the app for as long as it was
 * open — even with no rod timer running at all (e.g. just browsing
 * Statistics for half an hour). It now only ticks once a second WHILE a
 * rod timer is actually running, and is fully idle the rest of the
 * time — it wakes up instantly via sessionStore's own change
 * notifications (already fired on start/stop/land/cancel and on
 * cross-device merges) instead of blindly polling every second forever.
 */
export function useRodTimerMonitor() {
  const [anyRunning, setAnyRunning] = useState(false);
  useWakeLock(anyRunning);

  useEffect(() => {
    // Returns whether any timer is currently running, so the caller can
    // decide whether the 1s interval needs to keep going.
    function check() {
      const running = sessionStore.getRunningTimers();
      setAnyRunning(running.length > 0);

      for (const timer of running) {
        if (timer.reminderTriggered && !timer.reminderBeepsPlayed) {
          const newlyFired = sessionStore.markReminderTriggered(timer.rodId);
          if (newlyFired) {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

            if ("Notification" in window && Notification.permission === "granted") {
              try {
                new Notification("⏰ Време за презареждане!", {
                  body: `Въдица ${timer.rodId}: таймерът изтече (${timer.reminderMinutes} мин).`,
                  tag: `catchcount-rod-${timer.rodId}`,
                  requireInteraction: true,
                });
              } catch {
                // ignore notification errors
              }
            }

            playBeeps(timer.reminderMinutes || 1, timer.beepDuration ?? 0.5);
          }
        }
      }

      // Only stop beeps when no timers are running at all
      if (running.length === 0) {
        stopBeeps();
      }

      return running.length > 0;
    }

    let interval = null;
    const syncInterval = (running) => {
      if (running && !interval) {
        interval = setInterval(check, 1000);
      } else if (!running && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // Run once immediately, then only keep the 1s interval alive for as
    // long as something is actually running.
    syncInterval(check());

    // Re-check the instant the store changes (a timer started/stopped on
    // this device, or a cross-device merge brought one in) instead of
    // waiting for the next poll — this is what lets the interval above stay
    // off while nothing is running, with no loss of responsiveness.
    const unsubscribeStore = sessionStore.subscribe(() => {
      syncInterval(check());
    });

    const onVisibilityOrFocus = () => syncInterval(check());
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    return () => {
      if (interval) clearInterval(interval);
      unsubscribeStore();
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
      stopBeeps();
    };
  }, []);
}
