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
 */
export function useRodTimerMonitor() {
  const [anyRunning, setAnyRunning] = useState(false);
  useWakeLock(anyRunning);

  useEffect(() => {
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
    }

    check();
    const interval = setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      stopBeeps();
    };
  }, []);
}