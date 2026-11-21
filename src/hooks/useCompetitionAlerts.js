import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import * as sessionStore from "@/lib/sessionStore";
import { scheduleBeeps, cancelScheduledBeeps } from "@/lib/beep";
import { resolveTimes, getBoundaries } from "@/lib/competition";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKeepScreenAwakePref } from "@/hooks/useKeepScreenAwakePref";
import { useSingleBeepAlertPref } from "@/hooks/useSingleBeepAlertPref";

// v3.158 — sound at every competition stage change (and at its end). Mounted
// once in Layout, next to useRodTimerMonitor. Like the rod reminders, the beeps
// are pre-scheduled on the Web Audio clock (beep.js scheduleBeeps) so they
// still sound with the screen off. While the competition still has an upcoming
// stage change and the "Активна сесия" page is open, the screen is kept awake
// (same user preference as for the rod timers).
const PLAYING_GRACE_MS = 15000;

export function useCompetitionAlerts() {
  const location = useLocation();
  const onActiveSessionPage = location.pathname === "/active-session";
  const [keepScreenAwake] = useKeepScreenAwakePref();
  const [singleBeep] = useSingleBeepAlertPref();
  const singleRef = useRef(singleBeep);
  singleRef.current = singleBeep;
  const [upcoming, setUpcoming] = useState(false);
  const scheduledRef = useRef(new Map()); // "ts:count" -> { osc, ts }

  useWakeLock(upcoming && onActiveSessionPage && keepScreenAwake);

  useEffect(() => {
    const scheduled = scheduledRef.current;

    function sync() {
      const c = sessionStore.getCompetition();
      const now = Date.now();
      const bounds = c.enabled ? getBoundaries(resolveTimes(c)).filter((b) => b.ts > now) : [];
      setUpcoming(bounds.length > 0);
      const wanted = new Map(bounds.map((b) => [`${b.ts}:${b.count}`, b]));

      for (const [id, entry] of [...scheduled]) {
        if (wanted.has(id)) continue;
        if (entry.ts > now) {
          cancelScheduledBeeps(entry.osc); // time changed / mode switched off
          scheduled.delete(id);
        } else if (now - entry.ts > PLAYING_GRACE_MS) {
          scheduled.delete(id); // already sounded — don't cut a playing beep
        }
      }
      for (const [id, b] of wanted) {
        if (scheduled.has(id)) continue;
        const count = singleRef.current ? 1 : b.count;
        scheduled.set(id, { osc: scheduleBeeps(b.ts, count, 0.5), ts: b.ts });
      }
    }

    sync();
    const unsubscribe = sessionStore.subscribe(sync);
    const interval = setInterval(sync, 30000);
    const onVisible = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      for (const entry of scheduled.values()) {
        if (entry.ts > Date.now()) cancelScheduledBeeps(entry.osc);
      }
      scheduled.clear();
    };
  }, []);
}
