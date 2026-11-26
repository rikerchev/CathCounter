import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import RodTimer from "@/components/RodTimer";
import CompetitionPanel from "@/components/CompetitionPanel";
import SaveCatchDialog from "@/components/SaveCatchDialog";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw, Navigation, Loader2, Timer, Waves, Trophy, Lightbulb } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { getCurrentLocation, distanceMeters } from "@/lib/geolocation";
import { refreshWeatherCache, fetchWeather, getLastKnownWeather, getAdviceBaseline, setAdviceBaseline, getWeatherHistory } from "@/lib/weather";
import { buildAdvice } from "@/lib/fishActivity";
import FishAdvice from "@/components/FishAdvice";
import { listBait } from "@/lib/baitRepository";
import { saveCatch, updateCatchLocation, listCatchesByUser } from "@/lib/catchRepository";
import { parseCatchDate } from "@/lib/dateUtils";
import { resolveTimes } from "@/lib/competition";
import { useAuth } from "@/lib/AuthContext";
import { getAllCatches, getAllPendingPhotos } from "@/lib/localDb";
import { uploadAllPendingPhotos } from "@/lib/pendingPhotos";
import { pushOnly, getOnlineStatus } from "@/lib/syncEngine";
import * as sessionStore from "@/lib/sessionStore";
import GroundbaitMixer from "@/components/GroundbaitMixer";
import AppLockPrompt from "@/components/AppLockPrompt";
import { useAppLockPrompt } from "@/hooks/useAppLockPrompt";

const formatDuration = (s) => {
  if (!s && s !== 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min ${sec}s`;
};

// How far the cheap coarse check has to disagree with the last catch's
// confirmed precise position before it's treated as "moved to a different
// swim" and worth spending a precise GPS fix on. Below this, the angler is
// assumed to still be fishing the same spot, so the previous catch's
// precise location is reused instead of re-fetching. 50m errs toward
// "same swim" — a coarse (network/cell) fix can easily be off by tens of
// meters on its own, so a smaller threshold would trigger a precise
// re-fetch on almost every catch and defeat the point of this check.
const SAME_SPOT_THRESHOLD_M = 50;

export default function ActiveSession() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [sessionElapsed, setSessionElapsed] = useState(sessionStore.getSessionElapsed());
  const [sessionActive, setSessionActive] = useState(sessionStore.isSessionActive());
  const [rods, setRods] = useState(sessionStore.getRods());
  const [tackle, setTackle] = useState([]);
  const [pendingCatch, setPendingCatch] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locatingAll, setLocatingAll] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixedGroundbaits, setMixedGroundbaits] = useState(sessionStore.getMixedGroundbaits());
  // v3.158 — "Състезание" mode (see CompetitionPanel / lib/competition.js).
  const [competition, setCompetition] = useState(sessionStore.getCompetition());
  // v3.145 — per-rod fish count / total weight of the live session, shown on
  // the rod banner: { [rodNumber]: { count, weight } }.
  const [rodStats, setRodStats] = useState({});
  const refreshRodStats = useCallback(async () => {
    // v3.158 — in competition mode only catches since the race start count.
    const comp = sessionStore.getCompetition();
    const compStart = comp.enabled ? resolveTimes(comp).start : null;
    const start = compStart || sessionStore.getState().sessionStartTime;
    if (!start) {
      setRodStats({});
      return;
    }
    try {
      const all = await listCatchesByUser(user?.id);
      const out = {};
      for (const c of all) {
        if (c.rod == null) continue;
        // 60 s tolerance: a catch time can be stored without seconds.
        if (parseCatchDate(c).getTime() < start - 60000) continue;
        const r = out[c.rod] || (out[c.rod] = { count: 0, weight: 0 });
        r.count += 1;
        r.weight += Number(c.weight) || 0;
      }
      setRodStats(out);
    } catch {
      // non-blocking
    }
  }, [user?.id]);
  const autoLocationRef = useRef(false);
  const sessionLocation = rods.map((r) => r.config?.location).filter(Boolean)[0] || null;
  const appLock = useAppLockPrompt();

  // v3.39 — offer the "lock the app" instructions once, the moment the trip
  // actually starts (first cast, same signal Wake Lock already keys off of
  // — see rod-timer-screen-lock-2.45.md). Only for an installed, mobile
  // (Android/iOS) visitor who hasn't dismissed it before — see
  // useAppLockPrompt.js. Never re-triggers on its own afterwards; dismiss()
  // (called for ANY way of closing the dialog) marks it seen for good, and
  // Profile.jsx is the explicit way to bring it back.
  useEffect(() => {
    if (sessionActive && appLock.eligible && !appLock.dismissed) {
      appLock.setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the
    // sessionActive transition should trigger this, not every re-render of
    // the (stable-identity) appLock object.
  }, [sessionActive]);

  // Cross-device session resume (v3.147): compare with the cloud once on mount —
  // a stale or empty local session is replaced by the live one from the other
  // device without a prompt (the poll did that after 30 s anyway), a session
  // closed there is closed here. Then one immediate poll.
  useEffect(() => {
    sessionStore.reconcileFromCloud().then((adopted) => {
      if (adopted) {
        setRods(sessionStore.getRods());
        setSessionElapsed(sessionStore.getSessionElapsed());
        setSessionActive(sessionStore.isSessionActive());
        setMixedGroundbaits(sessionStore.getMixedGroundbaits());
        setCompetition(sessionStore.getCompetition());
        toast({ title: t("session.cloudSessionFound") });
      } else {
        sessionStore.syncNow();
      }
    });
  }, []);

  // Session starts on first cast (rod timer), not on page mount
  useEffect(() => {
    setSessionElapsed(sessionStore.getSessionElapsed());
    // Start cross-device sync polling when the page is open
    sessionStore.startCrossDeviceSync();
    return () => sessionStore.stopCrossDeviceSync();
  }, []);

  // Session timer tick — re-renders every second when active, every 10s otherwise (battery saving)
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionElapsed(sessionStore.getSessionElapsed());
      // Auto-close session after 10 hours without a catch
      const { shouldClose, endTime } = sessionStore.checkAutoClose();
      if (shouldClose) {
        autoCloseSession(endTime);
      }
    }, sessionActive ? 1000 : 10000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  // Subscribe to store changes (rod add/remove, timer state)
  useEffect(() => {
    return sessionStore.subscribe(() => {
      setRods(sessionStore.getRods());
      setSessionElapsed(sessionStore.getSessionElapsed());
      setSessionActive(sessionStore.isSessionActive());
      setMixedGroundbaits(sessionStore.getMixedGroundbaits());
      setCompetition(sessionStore.getCompetition());
      refreshRodStats();
    });
  }, [refreshRodStats]);

  // v3.145 — initial load, and again whenever the session starts/ends.
  useEffect(() => {
    refreshRodStats();
  }, [refreshRodStats, sessionActive]);

  // Auto-set water body name from coordinates when session becomes active
  useEffect(() => {
    if (!sessionActive) return;
    if (autoLocationRef.current) return;
    autoLocationRef.current = true;
    const currentRods = sessionStore.getRods();
    const hasLocation = currentRods.some((r) => r.config?.location);
    if (!hasLocation) {
      toast({ title: t("session.gettingLocation") });
      // Coarse fix: this just names the water body by its nearest
      // settlement, so a precise GPS lock isn't needed here — see
      // src/lib/geolocation.js. The catch-time fetch below (in
      // handleSaveCatch) stays precise, since that's what actually needs
      // the exact spot/distance.
      getCurrentLocation(lang, false)
        .then(({ name, latitude, longitude }) => {
          const updatedRods = sessionStore.getRods();
          updatedRods.forEach((r) => {
            sessionStore.updateRodConfig(r.id, {
              ...r.config,
              location: name,
              lat: latitude,
              lng: longitude,
            });
          });
          setRods(sessionStore.getRods());
          toast({ title: `${t("session.locationSet")} — ${name}` });
        })
        .catch(() => {
          toast({ title: t("session.couldNotGetLocation"), variant: "destructive" });
        });
    }
  }, [sessionActive, lang, t, toast]);

  // v3.171 — keep a recent weather reading on the device while the session runs
  // and there is a connection, so a catch made later while OFFLINE gets the
  // weather from the moment the device was last online (see lib/weather.js).
  // One small request per ~30 min, only while the page is visible and online.
  const weatherCfg = rods.map((r) => r.config).find((c) => c?.lat != null && c?.lng != null);
  const weatherLat = weatherCfg?.lat ?? null;
  const weatherLng = weatherCfg?.lng ?? null;
  useEffect(() => {
    if (!sessionActive || weatherLat == null || weatherLng == null) return undefined;
    const refresh = () => {
      if (document.hidden) return;
      refreshWeatherCache(weatherLat, weatherLng);
    };
    refresh();
    const id = setInterval(refresh, 30 * 60 * 1000);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", refresh);
    };
  }, [sessionActive, weatherLat, weatherLng]);

  // v3.174 — fish-activity advice (see lib/fishActivity.js). Three triggers:
  //  "start"  — the session became active and the weather is known;
  //  "change" — after a landed fish, online: only if the weather changed drastically
  //             since the last advice (at most one check per 5 minutes);
  //  "dry"    — every 10th cast without a catch: fresh weather (online) + advice.
  // The cards are kept in sessionStorage so they are still there when the angler
  // goes to another page and comes back (or reloads) during the same session.
  const [adviceList, setAdviceListState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("catchcount_advice_cards") || "[]");
    } catch {
      return [];
    }
  });
  const setAdviceList = useCallback((update) => {
    setAdviceListState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      try {
        sessionStorage.setItem("catchcount_advice_cards", JSON.stringify(next));
      } catch {
        // sessionStorage unavailable
      }
      return next;
    });
  }, []);
  const castsSinceCatchRef = useRef(0);
  const lastAdviceFetchRef = useRef(0);

  // v3.183 — kind "manual": the "Съвет" button — a fresh analysis on request. Resolves
  // to true when a card was shown.
  const runAdvice = useCallback(async (kind) => {
    if (weatherLat == null || weatherLng == null) return false;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (kind === "change" && (!online || Date.now() - lastAdviceFetchRef.current < 5 * 60 * 1000)) return false;
    let cur = null;
    if (online) {
      lastAdviceFetchRef.current = Date.now();
      try {
        cur = await fetchWeather(weatherLat, weatherLng);
      } catch {
        cur = null;
      }
    }
    if (!cur && kind !== "change") cur = getLastKnownWeather(weatherLat, weatherLng);
    if (!cur) return false;
    const prev = kind === "start" || kind === "manual" ? null : getAdviceBaseline();
    const history = getWeatherHistory(weatherLat, weatherLng);
    const advice = buildAdvice({ kind, prev, cur, t, extra: { history } });
    if (!advice) return false;
    // offline: the reading is the last one taken while online — say so
    if (cur.last_known_at) {
      const time = new Date(cur.last_known_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const note = t("fa.lastKnown").replace("{time}", time);
      advice.intro = advice.intro ? `${advice.intro} ${note}` : note;
    }
    setAdviceBaseline(cur);
    setAdviceList((list) =>
      [
        { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, kind, ...advice },
        ...list.filter((x) => !((kind === "start" || kind === "manual") && x.kind === kind)),
      ].slice(0, 3),
    );
    return true;
  }, [weatherLat, weatherLng, t, setAdviceList]);

  // the "Съвет" button
  const [adviceBusy, setAdviceBusy] = useState(false);
  const handleAdviceButton = async () => {
    if (adviceBusy) return;
    if (weatherLat == null || weatherLng == null) {
      toast({ title: t("fa.noLocation"), variant: "destructive" });
      return;
    }
    setAdviceBusy(true);
    try {
      const shown = await runAdvice("manual");
      if (!shown) toast({ title: t("fa.noWeather"), variant: "destructive" });
    } finally {
      setAdviceBusy(false);
    }
  };

  useEffect(() => {
    if (!sessionActive) {
      setAdviceList([]);
      return;
    }
    if (weatherLat == null || weatherLng == null) return;
    const startedAt = String(sessionStore.getState().sessionStartTime || 0);
    let done = false;
    try {
      done = sessionStorage.getItem("catchcount_advice_start_for") === startedAt;
      if (!done) sessionStorage.setItem("catchcount_advice_start_for", startedAt);
    } catch {
      // sessionStorage unavailable — advice may repeat after a reload
    }
    if (done) return;
    castsSinceCatchRef.current = 0;
    runAdvice("start");
  }, [sessionActive, weatherLat, weatherLng, runAdvice]);

  useEffect(() => {
    const onCast = () => {
      castsSinceCatchRef.current += 1;
      if (castsSinceCatchRef.current % 10 === 0) runAdvice("dry");
    };
    window.addEventListener("catchcount:cast", onCast);
    return () => window.removeEventListener("catchcount:cast", onCast);
  }, [runAdvice]);

  const loadTackle = useCallback(async () => {
    try {
      setTackle(await listBait());
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    loadTackle();
  }, [loadTackle]);

  const handleLandFish = (data) => {
    setPendingCatch(data);
    setDialogOpen(true);
  };

  const addRod = () => {
    sessionStore.addRod();
    setRods(sessionStore.getRods());
  };

  const removeRod = (id) => {
    sessionStore.removeRod(id);
    setRods(sessionStore.getRods());
  };

  const resetTrip = async () => {
    if (!window.confirm(t("session.resetConfirm"))) return;

    // Offline warning: check for unsynced data
    if (!getOnlineStatus()) {
      try {
        const allCatches = await getAllCatches();
        const unsyncedCatches = allCatches.filter(c => !c._synced);
        const pendingPhotos = await getAllPendingPhotos();
        if (unsyncedCatches.length > 0 || pendingPhotos.length > 0) {
          const msg = t("session.offlineWarningBody") +
            `\n\n${unsyncedCatches.length} ${t("session.unsyncedRecords")}` +
            `\n${pendingPhotos.length} ${t("session.unsyncedPhotos")}`;
          if (!window.confirm(msg)) return;
        }
      } catch {
        // ignore check errors
      }
    }

    const rodsSnapshot = sessionStore.getRods();
    const location = rodsSnapshot
      .map((r) => r.config?.location)
      .filter(Boolean)[0] || null;
    const duration = sessionStore.closeSession();
    setRods(sessionStore.getRods());
    setSessionElapsed(0);

    if (duration > 0) {
      try {
        const sessions = JSON.parse(localStorage.getItem("past_sessions") || "[]");
        sessions.push({ date: new Date().toISOString(), duration, location });
        localStorage.setItem("past_sessions", JSON.stringify(sessions));
        toast({ title: `${t("session.saved")} — ${formatDuration(duration)}` });
      } catch {
        toast({ title: t("session.couldNotSave"), variant: "destructive" });
      }
    } else {
      toast({ title: t("session.closed") });
    }

    // If online, trigger sync of catches and pending photos
    if (getOnlineStatus()) {
      pushOnly();
      uploadAllPendingPhotos();
    }

    autoLocationRef.current = false;
    setSessionActive(false);
    setSessionElapsed(0);
  };

  const getAllLocations = async () => {
    setLocatingAll(true);
    try {
      // Coarse fix here too — same reasoning as the auto-location effect
      // above: this names the water body by its nearest settlement, so a
      // precise GPS lock isn't needed.
      const { name, latitude, longitude } = await getCurrentLocation(lang, false);
      const currentRods = sessionStore.getRods();
      currentRods.forEach((r) => {
        sessionStore.updateRodConfig(r.id, {
          ...r.config,
          location: name,
          lat: latitude,
          lng: longitude,
        });
      });
      setRods(sessionStore.getRods());
      toast({ title: t("session.locationSet") });
    } catch (err) {
      toast({ title: t("session.couldNotGetLocation"), variant: "destructive" });
    } finally {
      setLocatingAll(false);
    }
  };

  const autoCloseSession = (endTime) => {
    const rodsSnapshot = sessionStore.getRods();
    const location = rodsSnapshot
      .map((r) => r.config?.location)
      .filter(Boolean)[0] || null;
    const duration = sessionStore.closeSession(endTime);
    setRods(sessionStore.getRods());
    setSessionElapsed(0);
    setSessionActive(false);

    if (duration > 0) {
      try {
        const sessions = JSON.parse(localStorage.getItem("past_sessions") || "[]");
        sessions.push({ date: new Date(endTime).toISOString(), duration, location });
        localStorage.setItem("past_sessions", JSON.stringify(sessions));
      } catch {}
    }

    toast({ title: t("session.autoClosed") });

    if (getOnlineStatus()) {
      pushOnly();
      uploadAllPendingPhotos();
    }

    autoLocationRef.current = false;
  };

  // Applies a confirmed precise fix to this catch (only writing to the
  // catch if the name actually differs from what it already had) and
  // remembers it as the session's new "last confirmed catch location" for
  // the next catch to compare against.
  const applyPreciseCatchLocation = (created, { name, latitude, longitude }) => {
    sessionStore.recordCatchLocation(name, latitude, longitude);
    if (name !== created.location) {
      updateCatchLocation(created.id, created.created_date, name, latitude, longitude);
    }
  };

  const handleSaveCatch = async (data) => {
    try {
      const created = await saveCatch(data);
      sessionStore.recordCatchTime();
      refreshRodStats();
      toast({ title: `${t("saveCatch.catchLogged")} — ${formatDuration(data.duration || 0)}` });
      // v3.174 — a fish was landed: the "casts without a catch" count starts over and,
      // online, the weather is compared with the one the last advice was based on.
      castsSinceCatchRef.current = 0;
      runAdvice("change");

      // Fetch GPS location in the background and update if different.
      if (created?.id) {
        const lastLoc = sessionStore.getLastCatchLocation();
        if (!lastLoc) {
          // First catch this session — nothing to compare against yet, so
          // always get a precise fix, same as before.
          getCurrentLocation(lang)
            .then((fix) => applyPreciseCatchLocation(created, fix))
            .catch(() => {});
        } else {
          // Not the first catch: a cheap coarse fix first — if it's still
          // within SAME_SPOT_THRESHOLD_M of the last confirmed precise
          // spot, the angler is almost certainly still fishing the same
          // swim, so reuse that location instead of spending a full
          // precise GPS fix on this catch too. Only escalate to a precise
          // fix when the coarse check suggests a real move.
          getCurrentLocation(lang, false)
            .then((coarse) => {
              const moved =
                distanceMeters(coarse.latitude, coarse.longitude, lastLoc.lat, lastLoc.lng) >
                SAME_SPOT_THRESHOLD_M;
              if (!moved) {
                if (lastLoc.name !== created.location) {
                  updateCatchLocation(created.id, created.created_date, lastLoc.name, lastLoc.lat, lastLoc.lng);
                }
                return;
              }
              return getCurrentLocation(lang).then((fix) => applyPreciseCatchLocation(created, fix));
            })
            .catch(() => {});
        }
      }
      return created;
    } catch {
      toast({ title: t("saveCatch.couldNotSave"), variant: "destructive" });
      return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-3 space-y-2.5">
      {/* v3.185 — compact header: title and timer/location on one line (the subtitle is gone) */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h1 className="text-lg font-bold text-slate-800 dark:text-foreground leading-tight">{t("session.title")}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1 rounded-lg bg-slate-900 min-w-0">
          {sessionActive ? (
            <p className="text-xs text-white flex items-center gap-1">
              <Timer className="w-3.5 h-3.5" />
              {formatDuration(sessionElapsed)}
            </p>
          ) : (
            <p className="text-xs text-white/70">{t("session.startByCasting")}</p>
          )}
          {sessionLocation && (
            <p className="text-xs text-white/90 flex items-center gap-1">
              <Navigation className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[55vw]">{sessionLocation}</span>
            </p>
          )}
        </div>
      </div>

      {/* v3.158 — competition mode switch */}
      {/* v3.185 — competition switch and the advice button share one row */}
      <div className="flex items-stretch gap-2">
      <label className="flex flex-1 min-w-0 items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-card border border-slate-100 dark:border-border shadow-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={competition.enabled}
          onChange={(e) => {
            if (!e.target.checked && competition.enabled && !window.confirm(t("sesscomp.disableConfirm"))) return;
            sessionStore.setCompetitionEnabled(e.target.checked);
            setRods(sessionStore.getRods());
            setCompetition(sessionStore.getCompetition());
          }}
          className="w-4 h-4 accent-cyan-600"
        />
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-foreground truncate">{t("sesscomp.title")}</span>
      </label>
      {/* v3.183 — advice on request: a fresh analysis of the current weather */}
      <Button variant="outline" onClick={handleAdviceButton} disabled={adviceBusy} className="flex-shrink-0 text-xs min-h-[36px] h-auto px-3 rounded-xl">
        {adviceBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 mr-1 text-amber-500" />}
        {t("fa.btn")}
      </Button>
      </div>

      {competition.enabled && (
        <CompetitionPanel competition={competition} rods={rods} rodStats={rodStats} />
      )}

      {/* Session controls */}
      <div className="grid grid-cols-2 gap-1.5">
        {!competition.enabled && (
          <Button variant="outline" onClick={addRod} className="text-xs min-h-[34px] h-auto py-1 px-2">
            <Plus className="w-3.5 h-3.5 mr-1" /> {t("session.addRod")}
          </Button>
        )}
        <Button variant="outline" onClick={() => setMixerOpen(true)} className="text-xs min-h-[34px] h-auto py-1 px-2">
          <Waves className="w-3.5 h-3.5 mr-1" /> {t("rod.groundbait")}
        </Button>
        <Button variant="outline" onClick={resetTrip} disabled={!sessionActive} className="text-xs min-h-[34px] h-auto py-1 px-2">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> {t("session.closeSession")}
        </Button>
        <Button
          variant="outline"
          onClick={getAllLocations}
          disabled={locatingAll}
          className="text-xs min-h-[34px] h-auto py-1 px-2"
        >
          {locatingAll ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Navigation className="w-3.5 h-3.5 mr-1" />}
          {t("session.getMyLocation")}
        </Button>
      </div>

      {/* v3.174 — fish-activity advice */}
      <FishAdvice
        items={adviceList}
        onDismiss={(id) => setAdviceList((list) => list.filter((x) => x.id !== id))}
        lat={weatherLat}
        lng={weatherLng}
      />

      {/* Mixed groundbaits summary */}
      {mixedGroundbaits.length > 0 && (
        <div className="p-3 rounded-xl bg-cyan-50 dark:bg-accent border border-cyan-100 dark:border-border">
          <p className="text-xs font-medium text-cyan-700 dark:text-cyan-400 mb-1">{t("session.mixedGroundbait")}</p>
          <div className="flex flex-wrap gap-1.5">
            {mixedGroundbaits.map((g, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-full bg-white dark:bg-card text-slate-600 dark:text-muted-foreground">
                {g.name}{g.grams ? ` (${g.grams}${t("common.grams")})` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rods */}
      <div className={`grid grid-cols-1 ${competition.enabled ? "" : "sm:grid-cols-2"} gap-3`}>
        {(competition.enabled
          ? rods.filter((r) => r.id === (rods.find((x) => x.id === competition.activeRodId) || rods[0]).id)
          : rods
        ).map((rod) => (
          <RodTimer
            key={rod.id}
            rodNumber={rod.id}
            name={rod.name}
            config={rod.config}
            onConfigChange={(config) => {
              sessionStore.updateRodConfig(rod.id, config);
              setRods(sessionStore.getRods());
            }}
            onLandFish={handleLandFish}
            tackle={tackle}
            mixedGroundbaits={mixedGroundbaits}
            onRemoveRod={() => removeRod(rod.id)}
            canRemove={rods.length > 1 && !competition.enabled}
            stats={rodStats[rod.id]}
          />
        ))}
      </div>

      <SaveCatchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        catchData={pendingCatch}
        onSave={handleSaveCatch}
      />

      <GroundbaitMixer
        open={mixerOpen}
        onOpenChange={setMixerOpen}
        existingNames={mixedGroundbaits.map((g) => g.name)}
        onAddGroundbait={(entry) => {
          sessionStore.addMixedGroundbait(entry);
          setMixedGroundbaits(sessionStore.getMixedGroundbaits());
        }}
      />

      {appLock.eligible && (
        <AppLockPrompt
          open={appLock.open}
          onOpenChange={(v) => (v ? appLock.setOpen(true) : appLock.dismiss())}
          platform={appLock.platform}
        />
      )}
    </div>
  );
}