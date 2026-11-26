import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Clock, Fish, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import * as sessionStore from "@/lib/sessionStore";
import { ROD_COLORS, rodColorIndex } from "@/lib/rodColors";
import {
  COMP_KEYS,
  MAX_COMPETITION_RODS,
  resolveTimes,
  getStageInfo,
  formatClock,
  formatCountdown,
} from "@/lib/competition";

const STAGE_LABEL = {
  settle: "sesscomp.stageSettle",
  heavy: "sesscomp.stageHeavy",
  race: "sesscomp.stageRace",
};
const INPUT_LABEL = {
  settle: "sesscomp.inputSettle",
  heavy: "sesscomp.inputHeavy",
  start: "sesscomp.inputStart",
  end: "sesscomp.inputEnd",
};

// v3.158 — the "Състезание" panel of the live session: the four times, the
// countdown of the current stage, the time left until the end of the race with
// the total catch next to it, and the choice of the rod currently in use.
export default function CompetitionPanel({ competition, rods, rodStats }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now());
  const [timesOpen, setTimesOpen] = useState(null); // null = automatic

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const times = resolveTimes(competition);
  const info = getStageInfo(times, now);
  const activeRod = rods.find((r) => r.id === competition.activeRodId) || rods[0];
  const { bar } = ROD_COLORS[rodColorIndex(activeRod)];

  const stats = Object.values(rodStats || {});
  const totalCount = stats.reduce((n, s) => n + s.count, 0);
  const totalWeight = stats.reduce((n, s) => n + s.weight, 0);

  const showTimes = timesOpen === null ? !info.anyTimes : timesOpen;

  const rodName = (r) => r.name || `${t("rod.rod")} ${r.id}`;
  const rodLabel = (r) => {
    const s = rodStats && rodStats[r.id];
    const extra = s && s.count > 0 ? ` · ${s.count}${s.weight > 0 ? ` · ~${s.weight.toFixed(1)} kg` : ""}` : "";
    return `${rodName(r)}${extra}`;
  };

  let big = "—";
  let caption = t("sesscomp.enterTimes");
  if (info.active) {
    big = formatCountdown(info.active.to - now);
    caption = `${t(STAGE_LABEL[info.active.key])} — ${t("sesscomp.stageLeft")}`;
  } else if (info.finished) {
    big = "00:00";
    caption = t("sesscomp.finished");
  } else if (info.upcoming) {
    big = formatCountdown(info.upcoming.from - now);
    caption = `${t("sesscomp.startsIn")}: ${t(STAGE_LABEL[info.upcoming.key])}`;
  }

  return (
    <div className="rounded-xl bg-white dark:bg-card border border-slate-100 dark:border-border shadow-sm overflow-hidden">
      <div className={`${bar} px-3 py-1 flex items-center justify-between`}>
        <span className="font-bold text-sm text-white flex items-center gap-1.5">
          <Trophy className="w-4 h-4" /> {t("sesscomp.title")}
        </span>
        <button
          type="button"
          onClick={() => setTimesOpen(!showTimes)}
          className="flex items-center gap-1 text-xs text-white/90 hover:text-white"
        >
          <Clock className="w-3.5 h-3.5" /> {t("sesscomp.hours")}
          {showTimes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {/* Current stage countdown */}
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-slate-900">
          <div className="text-3xl font-black tabular-nums text-white leading-none">{big}</div>
          <p className="text-[11px] leading-tight text-white/80 text-right min-w-0">{caption}</p>
        </div>

        {/* Time left until the end of the race + total catch */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-slate-100 dark:bg-accent px-2 py-1 text-center">
            <p className="text-[10px] leading-tight text-slate-500 dark:text-muted-foreground">{t("sesscomp.untilEnd")}</p>
            <p className="text-base font-bold tabular-nums text-slate-800 dark:text-foreground leading-tight">
              {info.raceEndRemaining != null ? formatCountdown(info.raceEndRemaining) : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 dark:bg-accent px-2 py-1 text-center">
            <p className="text-[10px] leading-tight text-slate-500 dark:text-muted-foreground">{t("sesscomp.totalCatch")}</p>
            <p className="text-base font-bold text-slate-800 dark:text-foreground flex items-center justify-center gap-1 leading-tight">
              <Fish className="w-3.5 h-3.5" />
              {totalCount}
              {totalWeight > 0 && <span className="text-sm font-semibold">· ~{totalWeight.toFixed(1)} kg</span>}
            </p>
          </div>
        </div>

        {/* Stages */}
        {info.anyTimes && (
          <div className="space-y-0.5">
            {info.segs
              .filter((s) => s.from != null && s.to != null)
              .map((s) => {
                const isActive = info.active && info.active.key === s.key;
                const done = now >= s.to;
                return (
                  <div
                    key={s.key}
                    className={`flex items-center justify-between text-[11px] px-2 py-0.5 rounded-md ${
                      isActive ? `${bar} text-white font-semibold` : done ? "text-slate-400 line-through" : "text-slate-600 dark:text-muted-foreground"
                    }`}
                  >
                    <span>{t(STAGE_LABEL[s.key])}</span>
                    <span className="tabular-nums">
                      {formatClock(s.from)} – {formatClock(s.to)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {/* Time inputs */}
        {showTimes && (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {COMP_KEYS.map((k) => (
              <div key={k} className="space-y-0.5">
                <Label className="text-[11px] leading-tight text-slate-600 dark:text-muted-foreground">{t(INPUT_LABEL[k])}</Label>
                <Input
                  type="time"
                  value={competition.hm[k] || ""}
                  onChange={(e) => sessionStore.setCompetitionTime(k, e.target.value)}
                  className="h-8 px-2 text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {/* Rods: how many, which one is in use, its name */}
        <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-border">
          <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
            <div className="space-y-0.5">
              <Label className="text-[11px] leading-tight text-slate-600 dark:text-muted-foreground">{t("sesscomp.rodCount")}</Label>
              <Select
                value={String(rods.length)}
                onValueChange={(v) => sessionStore.setCompetitionRodCount(Number(v))}
              >
                <SelectTrigger className="h-8 w-16 px-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_COMPETITION_RODS }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5 min-w-0">
              <Label className="text-[11px] leading-tight text-slate-600 dark:text-muted-foreground">{t("sesscomp.activeRod")}</Label>
              <Select
                value={String(activeRod ? activeRod.id : "")}
                onValueChange={(v) => sessionStore.setCompetitionActiveRod(Number(v))}
              >
                <SelectTrigger className="h-8 px-2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rods.map((r) => {
                    const running = sessionStore.getRodTimerState(r.id).isRunning;
                    return (
                      <SelectItem key={r.id} value={String(r.id)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ROD_COLORS[rodColorIndex(r)].bar}`} />
                          <span className="truncate">{rodLabel(r)}</span>
                          {running && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          {activeRod && (
            <div className="space-y-0.5">
              <Label className="text-[11px] leading-tight text-slate-600 dark:text-muted-foreground">{t("sesscomp.rodName")}</Label>
              <Input
                key={activeRod.id}
                defaultValue={activeRod.name || ""}
                onChange={(e) => sessionStore.setRodName(activeRod.id, e.target.value)}
                placeholder={`${t("rod.rod")} ${activeRod.id}`}
                maxLength={40}
                className="h-8 px-2 text-sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
