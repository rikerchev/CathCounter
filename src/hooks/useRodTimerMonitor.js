import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import * as sessionStore from "@/lib/sessionStore";
import { playBeeps, stopBeeps, scheduleBeeps, cancelScheduledBeeps } from "@/lib/beep";
import { useWakeLock } from "@/hooks/useWakeLock";

const ACTIVE_SESSION_PATH = "/active-session";

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
 *
 * v2.45 — screen-lock behaviour, per explicit user request:
 *  - The wake lock (keeping the screen on) is now only held while the
 *    user is actually ON the "Активна сесия" page AND a timer is
 *    running. Leave that page with a timer still running (e.g. to check
 *    Статистика) and the screen is free to turn off as normal again —
 *    previously the wake lock followed the timer everywhere in the app.
 *  - Whether or not the wake lock is held — including a screen the user
 *    turned off manually themselves — the reminder sound must still fire
 *    at the right moment. A plain 1-second JS poll (`setInterval`) is not
 *    reliable for that: the OS throttles or fully suspends it once the
 *    screen locks. So every running reminder now also gets its beeps
 *    PRE-SCHEDULED, the moment the timer starts (or its reminder is set
 *    /extended), on the Web Audio API's own audio-rendering clock via
 *    `scheduleBeeps()` — that clock keeps running even while the screen
 *    is off (see beep.js), unlike a regular JS timer. The 1-second poll
 *    below still runs (for the on-screen countdown, vibration and system
 *    notification while the app is actually visible) and only falls back
 *    to playing beeps itself if the pre-scheduled ones couldn't be set up
 *    at all (e.g. no Web Audio support) — otherwise it would double the
 *    sound.
 */
export function useRodTimerMonitor() {
  const [anyRunning, setAnyRunning] = useState(false);
  const location = useLocation();
  const onActiveSessionPage = location.pathname === ACTIVE_SESSION_PATH;
  useWakeLock(anyRunning && onActiveSessionPage);

  // rodId -> { oscillators, expiryMs } for reminders already handed off to
  // the audio clock. Kept in a ref (not state) since it's pure bookkeeping
  // that must survive every tick without causing a re-render.
  const scheduledRef = useRef({});

  useEffect(() => {
    // Cancels and forgets any pending audio-clock schedule for a rod whose
    // timer stopped, was cancelled, or had its reminder cleared before it
    // ever went off.
    function unscheduleRod(rodId) {
      const entry = scheduledRef.current[rodId];
      if (entry) {
        cancelScheduledBeeps(entry.oscillators);
        delete scheduledRef.current[rodId];
      }
    }

    // Returns whether any timer is currently running, so the caller can
    // decide whether the 1s interval needs to keep going.
    function check() {
      const running = sessionStore.getRunningTimers();
      setAnyRunning(running.length > 0);

      const runningRodIds = new Set(running.map((timer) => timer.rodId));
      for (const rodId of Object.keys(scheduledRef.current)) {
        if (!runningRodIds.has(Number(rodId))) unscheduleRod(rodId);
      }

      for (const timer of running) {
        // Keep (or create) an audio-clock schedule for this rod's reminder,
        // as long as it hasn't gone off yet. Re-scheduling only happens
        // when the expected expiry actually moved (reminder just set or
        // extended) — recomputing it every tick would otherwise re-arm the
        // same beep every second.
        if (timer.reminderMinutes && !timer.reminderTriggered) {
          const expiryMs = Date.now() + timer.reminderRemaining * 1000;
          const existing = scheduledRef.current[timer.rodId];
          if (!existing || Math.abs(existing.expiryMs - expiryMs) > 1500) {
            if (existing) cancelScheduledBeeps(existing.oscillators);
            const oscillators = scheduleBeeps(expiryMs, timer.reminderMinutes, timer.beepDuration ?? 0.5);
            scheduledRef.current[timer.rodId] = oscillators ? { oscillators, expiryMs } : null;
            if (!oscillators) delete scheduledRef.current[timer.rodId];
          }
        } else {
          unscheduleRod(timer.rodId);
        }

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

            // The audio-clock schedule above already produced this exact
            // beep sequence, on time, even if the screen was off — only
            // fall back to playing it live here when that schedule was
            // never actually set up (e.g. no Web Audio support at all).
            const hadSchedule = !!scheduledRef.current[timer.rodId];
            unscheduleRod(timer.rodId);
            if (!hadSchedule) {
              playBeeps(timer.reminderMinutes || 1, timer.beepDuration ?? 0.5);
            }
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
      for (const rodId of Object.keys(scheduledRef.current)) unscheduleRod(rodId);
    };
  }, []);
}
