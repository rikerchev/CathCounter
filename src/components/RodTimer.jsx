import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Square, MapPin, Tag, Ruler, Anchor, X, Navigation, Loader2, Waves, Fish, Package, Settings2, Bell, Ban, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";
import { getCurrentLocation } from "@/lib/geolocation";
import { useToast } from "@/components/ui/use-toast";
import * as sessionStore from "@/lib/sessionStore";
import { playBeeps, stopBeeps } from "@/lib/beep";
import TackleSelect from "@/components/TackleSelect";

const BEEP_DURATIONS = [0.4, 0.8, 1.2, 1.6];

const ROD_COLORS = [
  { bar: "bg-blue-500", text: "text-blue-600", nameKey: "rod.colorBlue" },
  { bar: "bg-rose-500", text: "text-rose-600", nameKey: "rod.colorRed" },
  { bar: "bg-emerald-500", text: "text-emerald-600", nameKey: "rod.colorGreen" },
  { bar: "bg-amber-500", text: "text-amber-600", nameKey: "rod.colorOrange" },
  { bar: "bg-violet-500", text: "text-violet-600", nameKey: "rod.colorPurple" },
  { bar: "bg-cyan-500", text: "text-cyan-600", nameKey: "rod.colorCyan" },
];

export default function RodTimer({ rodNumber, config, onConfigChange, onLandFish, tackle, mixedGroundbaits, onRemoveRod, canRemove }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [advancedMode, setAdvancedMode] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(
    () => sessionStore.getRodTimerState(rodNumber).reminderMinutes
  );
  const [beepDuration, setBeepDuration] = useState(
    () => sessionStore.getRodTimerState(rodNumber).beepDuration ?? 0.5
  );
  const [locating, setLocating] = useState(false);
  // v3.38 — see the "Извади" button fix below (controlsRef / the
  // useLayoutEffect right after handleCancel).
  const controlsRef = useRef(null);

  // Re-render to update the timer display from the store's timestamp.
  // Tick every 1s while running (or reminder triggered), otherwise every 10s to save battery.
  const [, setTick] = useState(0);
  const timerState = sessionStore.getRodTimerState(rodNumber);
  const { elapsed, isRunning, reminderRemaining, reminderTriggered } = timerState;
  const needsFrequentUpdates = isRunning || reminderTriggered;

  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), needsFrequentUpdates ? 1000 : 10000);
    return () => clearInterval(interval);
  }, [needsFrequentUpdates]);

  // Sync local reminderMinutes from store (for cross-device sync)
  useEffect(() => {
    if (timerState.reminderMinutes !== reminderMinutes) {
      setReminderMinutes(timerState.reminderMinutes);
    }
  }, [timerState.reminderMinutes]);

  const forceRender = () => setTick((v) => v + 1);
  const currentBeepDuration = timerState.beepDuration ?? beepDuration;

  const handleStart = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    sessionStore.startRodTimer(rodNumber, reminderMinutes);
    forceRender();
  };

  const handleLand = () => {
    stopBeeps();
    const finalElapsed = sessionStore.landRodFish(rodNumber);
    forceRender();
    onLandFish({ ...config, rod: rodNumber, duration: finalElapsed });
  };

  const handleCancel = () => {
    stopBeeps();
    sessionStore.cancelRodTimer(rodNumber);
    forceRender();
  };

  const handleDismissBeep = () => {
    stopBeeps();
  };

  // v3.38 — fix for: the "Извади" button rendered gray (the Button
  // component's own default off-white/near-gray style — see button.jsx's
  // `variant: "default"` → `bg-primary` — instead of the rod's own color)
  // right after pressing "Старт", every single cast, until literally any
  // other tap on the card forced the browser to repaint it. The color class
  // itself was always correct in the DOM (`${bar}`, same value the banner
  // and the "Старт" button already use correctly) — this was a mobile
  // WebKit/Safari quirk where a background-color that changes via a class
  // swap on the exact frame an element (re)appears sometimes isn't
  // actually painted until a later frame is forced by an interaction. A
  // quick hide/reflow/show right when the controls switch from "Старт" to
  // "Извади" forces that repaint immediately, in code, instead of waiting
  // on the user to tap something unrelated.
  useLayoutEffect(() => {
    if (!isRunning) return;
    const el = controlsRef.current;
    if (!el) return;
    const prevDisplay = el.style.display;
    el.style.display = "none";
    // eslint-disable-next-line no-unused-expressions -- reading a layout
    // property here is the point: it forces the browser to flush the
    // "none" display before we restore it, which is what makes the
    // subsequent repaint happen instead of getting stuck.
    void el.offsetHeight;
    el.style.display = prevDisplay;
  }, [isRunning]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };

  const handleGetLocation = async () => {
    setLocating(true);
    try {
      const { name, latitude, longitude } = await getCurrentLocation(lang);
      onConfigChange({ ...config, location: name, lat: latitude, lng: longitude });
      toast({ title: t("session.locationSet") });
    } catch (err) {
      const msg = err?.message === "not_supported"
        ? t("session.geolocationNotSupported")
        : err?.code === 1
          ? t("session.locationPermissionDenied")
          : t("session.couldNotGetLocation");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLocating(false);
    }
  };

  const colorIdx = config.rodColor ?? (rodNumber - 1) % ROD_COLORS.length;
  const { bar, text: timerColor } = ROD_COLORS[colorIdx];

  const rods = (tackle || []).filter((it) => it.category === "rod");
  const mixedNames = (mixedGroundbaits || []).map((g) => g.name);
  const groundbaits = (tackle || []).filter((it) => it.category === "groundbait");
  const baits = (tackle || []).filter((it) => !it.category || it.category === "bait");
  const hooks = (tackle || []).filter((it) => it.category === "hook");
  const lines = (tackle || []).filter((it) => it.category === "line");
  const others = (tackle || []).filter((it) => it.category === "other");

  return (
    <div
      className={`rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden ${reminderTriggered ? "ring-4 ring-amber-400 animate-pulse cursor-pointer" : ""}`}
      onClick={reminderTriggered ? handleDismissBeep : undefined}
    >
      <div className={`${bar} px-4 py-2 flex items-center justify-between`}>
        <span className="font-bold text-white flex items-center gap-1.5">
          <Fish className="w-4 h-4" /> {t("rod.rod")} {rodNumber}
        </span>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs bg-white/25 px-2 py-0.5 rounded-full text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t("rod.timing")}
            </span>
          )}
          <Select
            value={String(colorIdx)}
            onValueChange={(v) => onConfigChange({ ...config, rodColor: parseInt(v) })}
          >
            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-white/20 text-white text-xs font-medium hover:bg-white/30 px-2">
              <div className="w-3.5 h-3.5 rounded-full bg-white/80" />
              <ChevronDown className="w-3 h-3" />
            </SelectTrigger>
            <SelectContent>
              {ROD_COLORS.map((c, i) => (
                <SelectItem key={i} value={String(i)}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full ${c.bar}`} />
                    <span>{t(c.nameKey)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canRemove && (
            <button
              onClick={onRemoveRod}
              className="text-white/70 hover:text-white p-1.5 -mr-1"
              title={t("rod.removeRod")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Timer */}
        <div className="text-center py-2 rounded-xl bg-slate-900">
          <div className={`text-5xl font-black tabular-nums text-white`}>
            {formatTime(elapsed)}
          </div>
          <p className="text-xs text-white/80 mt-1">
            {reminderTriggered
              ? t("rod.refillTime")
              : isRunning
                ? (reminderMinutes && reminderRemaining > 0
                    ? `${t("rod.reminderIn")} ${formatTime(reminderRemaining)}`
                    : t("rod.fishOn"))
                : t("rod.readyToCast")}
          </p>
        </div>

        {/* Reminder input + beep duration selector (before casting) */}
        {!isRunning && (
          <div className="flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <Input
              type="number"
              min="0"
              value={reminderMinutes ?? ""}
              onChange={(e) => setReminderMinutes(e.target.value ? parseInt(e.target.value) : null)}
              placeholder={t("rod.setReminder")}
              className="h-8 w-16 text-xs px-2 flex-shrink-0"
            />
            {BEEP_DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setBeepDuration(d);
                  sessionStore.setRodBeepDuration(rodNumber, d);
                }}
                className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors ${
                  currentBeepDuration === d
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        )}

        {/* Set reminder + beep duration selector (while running) */}
        {isRunning && (
          <div className="flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <Input
              type="number"
              min="1"
              value={reminderMinutes ?? ""}
              onChange={(e) => setReminderMinutes(e.target.value ? parseInt(e.target.value) : null)}
              placeholder={t("rod.setReminder")}
              className="h-8 w-14 text-xs px-2 flex-shrink-0"
            />
            {reminderMinutes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStore.setRodReminder(rodNumber, reminderMinutes);
                  forceRender();
                }}
                className="h-8 px-2 flex-shrink-0 text-xs"
              >
                {t("rod.set")}
              </Button>
            )}
            {BEEP_DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setBeepDuration(d);
                  sessionStore.setRodBeepDuration(rodNumber, d);
                }}
                className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors ${
                  currentBeepDuration === d
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2" ref={controlsRef}>
          {!isRunning ? (
            <Button
              key="start"
              onClick={handleStart}
              className={`flex-1 ${bar} text-white hover:opacity-90 h-11`}
            >
              <Play className="w-4 h-4 mr-1" /> {t("rod.startTimer")}
            </Button>
          ) : (
            <React.Fragment key="running">
              {/* v3.20 — was a fixed bg-rose-600 regardless of which color
                  the rod card itself was set to; the user's own explicit
                  ask was for this button (and the already-matching Старт
                  button above) to always match the rod's own banner color
                  (${bar}, from ROD_COLORS — the same value driving the
                  card header at the top of this component and the Старт
                  button's own className) instead of a hardcoded color. */}
              <Button
                onClick={handleLand}
                className={`flex-1 ${bar} text-white hover:opacity-90 h-11`}
              >
                <Square className="w-4 h-4 mr-1" /> {t("rod.landFish")}
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="h-11 px-4"
              >
                <Ban className="w-4 h-4 mr-1" /> {t("common.cancel")}
              </Button>
            </React.Fragment>
          )}
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setAdvancedMode(!advancedMode)}
          className="flex items-center gap-1 text-xs text-white hover:text-white/80"
        >
          <Settings2 className="w-3 h-3" />
          {advancedMode ? t("rod.basicMode") : t("rod.advancedMode")}
        </button>

        {/* Tackle */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100">
          {/* Groundbait 1 + Groundbait 2 */}
          <div className="grid grid-cols-2 gap-2">
            <TackleSelect
              icon={Waves}
              label={t("rod.groundbait1")}
              placeholder={t("rod.selectGroundbait")}
              items={[...groundbaits, ...mixedNames.map((n) => ({ id: n, name: n }))]}
              value={config.feeder}
              onChange={(v) => onConfigChange({ ...config, feeder: v })}
            />
            <TackleSelect
              icon={Waves}
              label={t("rod.groundbait2")}
              placeholder={t("rod.groundbait2Placeholder")}
              items={[...groundbaits, ...mixedNames.map((n) => ({ id: n, name: n }))]}
              value={config.feeder2}
              onChange={(v) => onConfigChange({ ...config, feeder2: v })}
            />
          </div>

          {/* Bait + Hook */}
          <div className="grid grid-cols-2 gap-2">
            <TackleSelect
              icon={Tag}
              label={t("rod.bait")}
              placeholder={t("rod.selectBait")}
              items={baits}
              value={config.bait}
              onChange={(v) => onConfigChange({ ...config, bait: v })}
            />
            <TackleSelect
              icon={Anchor}
              label={t("rod.hook")}
              placeholder={t("rod.selectHook")}
              items={hooks}
              value={config.hook_size}
              onChange={(v) => onConfigChange({ ...config, hook_size: v })}
            />
          </div>

          {advancedMode && (
            <>
              {/* Rod model + Line */}
              <div className="grid grid-cols-2 gap-2">
                <TackleSelect
                  icon={Fish}
                  label={t("rod.model")}
                  placeholder={t("rod.selectRod")}
                  items={rods}
                  value={config.rod_model}
                  onChange={(v) => onConfigChange({ ...config, rod_model: v })}
                />
                <TackleSelect
                  icon={Ruler}
                  label={t("rod.line")}
                  placeholder={t("rod.selectLine")}
                  items={lines}
                  value={config.line}
                  onChange={(v) => onConfigChange({ ...config, line: v })}
                />
              </div>

              {/* Other */}
              <TackleSelect
                icon={Package}
                label={t("rod.other")}
                placeholder={t("rod.selectOther")}
                items={others}
                value={config.rig_details}
                onChange={(v) => onConfigChange({ ...config, rig_details: v })}
              />

              {/* Distance + Location */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-white flex items-center gap-1">
                     <Ruler className="w-3 h-3" /> {t("rod.distance")}
                   </Label>
                  <Input
                    value={config.distance || ""}
                    onChange={(e) => onConfigChange({ ...config, distance: e.target.value })}
                    placeholder="30m"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-white flex items-center gap-1">
                     <MapPin className="w-3 h-3" /> {t("rod.location")}
                   </Label>
                  <div className="flex gap-1">
                    <Input
                      value={config.location || ""}
                      onChange={(e) => onConfigChange({ ...config, location: e.target.value })}
                      placeholder={t("rod.location")}
                      className="h-9 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-10 flex-shrink-0"
                      onClick={handleGetLocation}
                      disabled={locating}
                    >
                      {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}