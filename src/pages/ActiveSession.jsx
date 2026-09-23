import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import RodTimer from "@/components/RodTimer";
import SaveCatchDialog from "@/components/SaveCatchDialog";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw, Navigation, Loader2, Timer, Waves } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { getCurrentLocation, distanceMeters } from "@/lib/geolocation";
import { listBait } from "@/lib/baitRepository";
import { saveCatch, updateCatchLocation } from "@/lib/catchRepository";
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

  const [sessionElapsed, setSessionElapsed] = useState(sessionStore.getSessionElapsed());
  const [sessionActive, setSessionActive] = useState(sessionStore.isSessionActive());
  const [rods, setRods] = useState(sessionStore.getRods());
  const [tackle, setTackle] = useState([]);
  const [pendingCatch, setPendingCatch] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locatingAll, setLocatingAll] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [mixedGroundbaits, setMixedGroundbaits] = useState(sessionStore.getMixedGroundbaits());
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

  // Cross-device session resume: check for active cloud session on mount
  useEffect(() => {
    if (sessionStore.isSessionActive()) return;
    sessionStore.checkCloudSession().then((cloudSession) => {
      if (!cloudSession) return;
      if (window.confirm(t("session.resumeQuestion"))) {
        sessionStore.resumeFromCloud(cloudSession).then((ok) => {
          if (ok) {
            setRods(sessionStore.getRods());
            setSessionElapsed(sessionStore.getSessionElapsed());
            setSessionActive(sessionStore.isSessionActive());
            setMixedGroundbaits(sessionStore.getMixedGroundbaits());
            toast({ title: t("session.cloudSessionFound") });
          }
        });
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
    });
  }, []);

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
      toast({ title: `${t("saveCatch.catchLogged")} — ${formatDuration(data.duration || 0)}` });

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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("session.title")}</h1>
        <p className="text-sm text-slate-400">{t("session.subtitle")}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-3 py-1.5 rounded-lg bg-slate-900">
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
              <Navigation className="w-3 h-3" />
              {sessionLocation}
            </p>
          )}
        </div>
      </div>

      {/* Session controls */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={addRod} className="text-xs min-h-[40px] px-2">
          <Plus className="w-3.5 h-3.5 mr-1" /> {t("session.addRod")}
        </Button>
        <Button variant="outline" onClick={() => setMixerOpen(true)} className="text-xs min-h-[40px] px-2">
          <Waves className="w-3.5 h-3.5 mr-1" /> {t("rod.groundbait")}
        </Button>
        <Button variant="outline" onClick={resetTrip} disabled={!sessionActive} className="text-xs min-h-[40px] px-2">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> {t("session.closeSession")}
        </Button>
        <Button
          variant="outline"
          onClick={getAllLocations}
          disabled={locatingAll}
          className="text-xs min-h-[40px] px-2"
        >
          {locatingAll ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Navigation className="w-3.5 h-3.5 mr-1" />}
          {t("session.getMyLocation")}
        </Button>
      </div>

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rods.map((rod) => (
          <RodTimer
            key={rod.id}
            rodNumber={rod.id}
            config={rod.config}
            onConfigChange={(config) => {
              sessionStore.updateRodConfig(rod.id, config);
              setRods(sessionStore.getRods());
            }}
            onLandFish={handleLandFish}
            tackle={tackle}
            mixedGroundbaits={mixedGroundbaits}
            onRemoveRod={() => removeRod(rod.id)}
            canRemove={rods.length > 1}
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