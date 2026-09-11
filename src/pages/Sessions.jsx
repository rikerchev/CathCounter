import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, MapPin, Thermometer, Wind, Clock, Weight, Trophy,
  ChevronRight, ChevronDown, ChevronUp, Trash2, CalendarArrowDown as CalendarDown,
  Fish,
} from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { listCatchesByUser, deleteCatch } from "@/lib/catchRepository";
import SessionCalendar from "@/components/SessionCalendar";

const SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

import { parseCatchDate } from "@/lib/dateUtils";
import { translateSpecies } from "@/lib/speciesUtils";
function parseDate(c) {
  return parseCatchDate(c).getTime();
}

function groupIntoSessions(catches) {
  if (!catches.length) return [];
  const sorted = [...catches].sort((a, b) => parseDate(a) - parseDate(b));
  const sessions = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prevDate = parseDate(sorted[i - 1]);
    const currDate = parseDate(sorted[i]);
    if (currDate - prevDate > SESSION_GAP_MS) {
      sessions.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  sessions.push(current);
  return sessions;
}

function mostFrequent(items) {
  const counts = {};
  let best = null;
  let bestCount = 0;
  for (const item of items) {
    if (!item) continue;
    counts[item] = (counts[item] || 0) + 1;
    if (counts[item] > bestCount) {
      best = item;
      bestCount = counts[item];
    }
  }
  return best;
}

function avg(nums) {
  const valid = nums.filter((n) => n != null && !isNaN(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(nums) {
  return nums.filter((n) => n != null && !isNaN(n)).reduce((a, b) => a + b, 0);
}

function formatSessionDuration(ms) {
  if (!ms) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatCatchDuration(s) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}м ${sec}с`;
}

function SessionCard({ session, t, expanded, onToggle, onDeleteSession, onDeleteCatch }) {
  const startTs = parseDate(session[0]);
  const endTs = parseDate(session[session.length - 1]);
  const durationMs = endTs - startTs;

  const temperatures = session.map((c) => c.air_temperature);
  const windSpeeds = session.map((c) => c.wind_speed);
  const weights = session.map((c) => c.weight);

  const biggestFish = weights.some((w) => w != null)
    ? session.reduce((best, c) => (c.weight != null && (!best || c.weight > best.weight) ? c : best), null)
    : null;

  const topBait = mostFrequent(session.map((c) => c.bait));
  const topGroundbait = mostFrequent(session.map((c) => c.feeder));
  const topHook = mostFrequent(session.map((c) => c.hook_size));
  const topDistance = mostFrequent(session.map((c) => c.distance));
  const location = mostFrequent(session.map((c) => c.location));

  const avgTemp = avg(temperatures);
  const avgWind = avg(windSpeeds);
  const totalWeight = sum(weights);

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <div className="font-bold flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> {location || t("common.unknown")}
            </div>
            <div className="text-xs text-white/80 mt-0.5">{formatDate(startTs)}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-white">
              <div className="text-xs text-white/80">{t("sessions.catches")}</div>
              <div className="font-bold text-lg">{session.length}</div>
            </div>
            <button
              onClick={onDeleteSession}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              title={t("sessions.deleteSession")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Time + Duration */}
      <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>{formatTime(startTs)} – {formatTime(endTs)}</span>
        </div>
        <div className="text-sm font-semibold text-cyan-600">
          {formatSessionDuration(durationMs)}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-slate-50">
        <StatCell icon={Thermometer} label={t("sessions.avgTemp")} value={avgTemp != null ? `${avgTemp.toFixed(1)}°C` : "—"} />
        <StatCell icon={Wind} label={t("sessions.avgWind")} value={avgWind != null ? `${avgWind.toFixed(1)} m/s` : "—"} />
        <StatCell icon={Weight} label={t("sessions.totalWeight")} value={totalWeight ? `${totalWeight.toFixed(2)} kg` : "—"} />
        <StatCell icon={Trophy} label={t("sessions.biggestFish")} value={biggestFish ? `${biggestFish.weight} kg` : "—"} />
      </div>

      {/* Top items */}
      <div className="px-4 py-3 space-y-1.5 border-t border-slate-50">
        <TopItem label={t("sessions.topBait")} value={topBait} />
        <TopItem label={t("sessions.topGroundbait")} value={topGroundbait} />
        <TopItem label={t("sessions.topHook")} value={topHook} />
        <TopItem label={t("sessions.topDistance")} value={topDistance} />
      </div>

      {/* Expand/collapse catches */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-1 px-4 py-2.5 border-t border-slate-50 text-sm text-slate-500 hover:bg-slate-50 min-h-[44px]"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? t("sessions.collapseCatches") : t("sessions.expandCatches")}
      </button>

      {/* Individual catches */}
      {expanded && (
        <div className="divide-y divide-slate-50 border-t border-slate-50">
          {session.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link to={`/catch-details?id=${c.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${c.rod === 2 ? "bg-emerald-500" : "bg-cyan-500"}`}>
                  R{c.rod}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 text-sm truncate">{translateSpecies(c.species, t) || t("common.unknown")}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {formatTime(parseDate(c))}
                    {` · ${formatCatchDuration(c.duration)}`}
                    {c.weight ? ` · ${c.weight} kg` : ""}
                    {c.bait ? ` · ${c.bait}` : ""}
                  </div>
                </div>
                {c.photo_url && (
                  <Thumbnail src={c.photo_url} alt="catch" width={40} height={40} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </Link>
              <button
                onClick={() => onDeleteCatch(c.id)}
                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
                title={t("sessions.deleteCatch")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ icon: Icon, label, value }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function TopItem({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value || "—"}</span>
    </div>
  );
}

export default function Sessions() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const catches = await listCatchesByUser(user.id);
      setSessions(groupIntoSessions(catches));
    } catch {
      toast({ title: t("history.couldNotLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteSession = async (session) => {
    if (!window.confirm(t("sessions.deleteConfirm"))) return;
    try {
      for (const c of session) {
        await deleteCatch(c.id);
      }
      toast({ title: t("sessions.deleted") });
      setExpandedIdx(null);
      await load();
    } catch {
      toast({ title: t("sessions.deleteFailed"), variant: "destructive" });
    }
  };

  const handleDeleteCatch = async (catchId) => {
    if (!window.confirm(t("sessions.deleteCatchConfirm"))) return;
    try {
      await deleteCatch(catchId);
      toast({ title: t("sessions.catchDeleted") });
      await load();
    } catch {
      toast({ title: t("sessions.deleteFailed"), variant: "destructive" });
    }
  };

  const sessionDateStrings = new Set(
    sessions.map((s) => new Date(parseDate(s[0])).toDateString())
  );

  const filteredSessions = selectedDate
    ? sessions.filter((s) => {
        const sd = new Date(parseDate(s[0]));
        return sd.toDateString() === selectedDate.toDateString();
      })
    : sessions;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("sessions.title")}</h1>
        <p className="text-sm text-slate-400">
          {sessions.length} {sessions.length === 1 ? t("sessions.sessionLabel") : t("sessions.sessionsLabel")}
        </p>
      </div>

      <SessionCalendar
        sessionDates={sessionDateStrings}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {selectedDate && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">
            {selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)} className="min-h-[44px]">
            {t("sessions.showAll")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDown className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">
            {selectedDate ? t("sessions.noSessionsDay") : t("sessions.noSessions")}
          </p>
          <p className="text-slate-300 text-sm mt-1">{t("sessions.startFishing")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session, idx) => (
            <SessionCard
              key={idx}
              session={session}
              t={t}
              expanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              onDeleteSession={() => handleDeleteSession(session)}
              onDeleteCatch={handleDeleteCatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}