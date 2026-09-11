import React, { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Tag, MapPin, Calendar, Anchor, Ruler, Waves, Thermometer, Cloud, Wind, Trash2, Gauge, Users, User as UserIcon, Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatsChart from "@/components/StatsChart";
import SmartRecommendations from "@/components/SmartRecommendations";
import AdBanner from "@/components/AdBanner";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { listCatches, deleteCatch } from "@/lib/catchRepository";
import { parseCatchDate } from "@/lib/dateUtils";
import { translateSpecies } from "@/lib/speciesUtils";

const PIE_COLORS = ["#0891b2", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#3b82f6", "#ef4444", "#14b8a6"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const windCategory = (speed) => {
  if (speed == null) return null;
  if (speed < 2) return "calm";
  if (speed < 5) return "light";
  if (speed < 8) return "moderate";
  return "strong";
};

const tempRange = (temp) => {
  if (temp == null) return null;
  if (temp < 5) return "<5";
  if (temp < 10) return "5-10";
  if (temp < 15) return "10-15";
  if (temp < 20) return "15-20";
  if (temp < 25) return "20-25";
  return "25+";
};

const tempRanges = ["<5", "5-10", "10-15", "15-20", "20-25", "25+"];
const windOptions = ["calm", "light", "moderate", "strong"];
const cloudOptions = ["clear", "partly_cloudy", "cloudy", "overcast"];

function groupBy(catches, keyFn) {
  const map = {};
  catches.forEach((c) => {
    const key = keyFn(c);
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).map(([label, count]) => ({ label, count }));
}

function ChartSection({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function Statistics() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [allCatches, setAllCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [scope, setScope] = useState("mine");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterTemp, setFilterTemp] = useState("");
  const [filterWind, setFilterWind] = useState("");
  const [filterCloudiness, setFilterCloudiness] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    listCatches()
      .then(setAllCatches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const catches = useMemo(() => {
    if (scope === "mine" && user) return allCatches.filter((c) => c.created_by_id === user.id);
    return allCatches;
  }, [allCatches, scope, user]);

  const uniqueLocations = useMemo(() => {
    const set = new Set(catches.map((c) => c.location).filter(Boolean));
    return [...set].sort();
  }, [catches]);

  const filteredCatches = useMemo(() => {
    let result = catches;
    if (filterLocation) result = result.filter((c) => c.location === filterLocation);
    if (filterTemp) result = result.filter((c) => tempRange(c.air_temperature) === filterTemp);
    if (filterWind) result = result.filter((c) => windCategory(c.wind_speed) === filterWind);
    if (filterCloudiness) result = result.filter((c) => c.cloudiness === filterCloudiness);
    return result;
  }, [catches, filterLocation, filterTemp, filterWind, filterCloudiness]);

  const hasFilters = filterLocation || filterTemp || filterWind || filterCloudiness;

  const clearFilters = () => {
    setFilterLocation("");
    setFilterTemp("");
    setFilterWind("");
    setFilterCloudiness("");
  };

  const byMonth = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      const d = parseCatchDate(c);
      if (!d || isNaN(d)) return;
      const key = `${d.toLocaleString(undefined, { month: "short" })} ${d.getFullYear()}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([label, count]) => ({ label, count })).slice(-6);
  }, [filteredCatches]);

  const bySpecies = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      const key = translateSpecies(c.species, t) || t("common.unknown");
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filteredCatches, t]);

  const byDay = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      const d = parseCatchDate(c);
      if (!d || isNaN(d)) return;
      const dayName = DAYS[d.getDay()];
      map[dayName] = (map[dayName] || 0) + 1;
    });
    return DAYS.map((d) => ({ label: t(`stats.day.${d}`) || d, count: map[d] || 0 })).filter((d) => d.count > 0);
  }, [filteredCatches]);

  const byLocation = useMemo(() => groupBy(filteredCatches, (c) => c.location).sort((a, b) => b.count - a.count).slice(0, 8), [filteredCatches]);
  const byBait = useMemo(() => groupBy(filteredCatches, (c) => c.bait).sort((a, b) => b.count - a.count), [filteredCatches]);
  const byHook = useMemo(() => groupBy(filteredCatches, (c) => c.hook_size).sort((a, b) => b.count - a.count), [filteredCatches]);
  const byLine = useMemo(() => groupBy(filteredCatches, (c) => c.line).sort((a, b) => b.count - a.count), [filteredCatches]);
  const byFeeder = useMemo(() => groupBy(filteredCatches, (c) => c.feeder).sort((a, b) => b.count - a.count), [filteredCatches]);

  const byTemp = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      const range = tempRange(c.air_temperature);
      if (!range) return;
      map[range] = (map[range] || 0) + 1;
    });
    return tempRanges.map((r) => ({ label: `${r}°C`, count: map[r] || 0 })).filter((d) => d.count > 0);
  }, [filteredCatches]);

  const byCloudiness = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      if (!c.cloudiness) return;
      map[c.cloudiness] = (map[c.cloudiness] || 0) + 1;
    });
    return cloudOptions.filter((o) => map[o]).map((o) => ({ label: t(`cloudiness.${o}`), count: map[o] }));
  }, [filteredCatches, t]);

  const byWind = useMemo(() => {
    const map = {};
    filteredCatches.forEach((c) => {
      const cat = windCategory(c.wind_speed);
      if (!cat) return;
      map[cat] = (map[cat] || 0) + 1;
    });
    return windOptions.filter((o) => map[o]).map((o) => ({ label: t(`stats.wind.${o}`), count: map[o] }));
  }, [filteredCatches, t]);

  const byDistance = useMemo(() => groupBy(filteredCatches, (c) => c.distance).sort((a, b) => b.count - a.count), [filteredCatches]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  const totalCatches = filteredCatches.length;
  const totalWeight = filteredCatches.reduce((s, c) => s + (c.weight || 0), 0);
  const uniqueFilteredLocations = new Set(filteredCatches.map((c) => c.location).filter(Boolean)).size;

  const handleResetStats = async () => {
    if (!window.confirm(t("stats.resetConfirm"))) return;
    setResetting(true);
    try {
      const userCatches = allCatches.filter((c) => c.created_by_id === user?.id);
      await Promise.all(userCatches.map((c) => deleteCatch(c.id)));
      setAllCatches((prev) => prev.filter((c) => c.created_by_id !== user?.id));
      toast({ title: t("stats.resetDone") });
    } catch {
      toast({ title: t("stats.resetFailed"), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("stats.title")}</h1>
          <p className="text-sm text-slate-400">{t("stats.subtitle")}</p>
        </div>
        {scope === "mine" && totalCatches > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
            onClick={handleResetStats}
            disabled={resetting}
          >
            {resetting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            {t("stats.resetStats")}
          </Button>
        )}
      </div>

      {/* Scope toggle: my catches vs all anglers */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-accent w-fit">
        <button
          onClick={() => setScope("mine")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            scope === "mine" ? "bg-white dark:bg-card text-cyan-700 dark:text-cyan-400 shadow-sm" : "text-slate-500"
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" /> {t("stats.myCatches")}
        </button>
        <button
          onClick={() => setScope("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] ${
            scope === "all" ? "bg-white dark:bg-card text-cyan-700 dark:text-cyan-400 shadow-sm" : "text-slate-500"
          }`}
        >
          <Users className="w-3.5 h-3.5" /> {t("stats.allUsers")}
        </button>
      </div>

      {/* Filters */}
      {catches.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">{t("stats.filters")}</span>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600"
              >
                <X className="w-3 h-3" /> {t("stats.clear")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("logCatch.location")} />
              </SelectTrigger>
              <SelectContent>
                {uniqueLocations.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTemp} onValueChange={setFilterTemp}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("logCatch.airTemp")} />
              </SelectTrigger>
              <SelectContent>
                {tempRanges.map((r) => (
                  <SelectItem key={r} value={r}>{r}°C</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterWind} onValueChange={setFilterWind}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("logCatch.windSpeed")} />
              </SelectTrigger>
              <SelectContent>
                {windOptions.map((w) => (
                  <SelectItem key={w} value={w}>{t(`stats.wind.${w}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCloudiness} onValueChange={setFilterCloudiness}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("logCatch.cloudiness")} />
              </SelectTrigger>
              <SelectContent>
                {cloudOptions.map((c) => (
                  <SelectItem key={c} value={c}>{t(`cloudiness.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <AdBanner />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm text-center">
          <p className="text-2xl font-black text-cyan-600">{totalCatches}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("dashboard.catches")}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm text-center">
          <p className="text-2xl font-black text-emerald-600">{totalWeight.toFixed(1)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("stats.kgTotal")}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm text-center">
          <p className="text-2xl font-black text-amber-600">{uniqueFilteredLocations}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t("stats.locations")}</p>
        </div>
      </div>

      {totalCatches === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          {hasFilters ? t("stats.noDataFiltered") : t("stats.noData")}
        </div>
      ) : (
        <>
          <SmartRecommendations catches={filteredCatches} />

          {byMonth.length > 0 && (
            <ChartSection icon={BarChart3} title={t("stats.catchesByMonth")}>
              <StatsChart data={byMonth} color="#0891b2" />
            </ChartSection>
          )}

          {bySpecies.length > 0 && (
            <ChartSection icon={Tag} title={t("stats.speciesFrequency")}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={bySpecies} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80}
                    label={({ label, percent }) => `${label} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {bySpecies.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {byDay.length > 0 && (
            <ChartSection icon={Calendar} title={t("stats.byDay")}>
              <StatsChart data={byDay} color="#3b82f6" />
            </ChartSection>
          )}

          {byLocation.length > 0 && (
            <ChartSection icon={MapPin} title={t("stats.topLocations")}>
              <StatsChart data={byLocation} color="#10b981" layout="vertical" height={Math.max(200, byLocation.length * 36)} />
            </ChartSection>
          )}

          {byBait.length > 0 && (
            <ChartSection icon={Tag} title={t("stats.byBait")}>
              <StatsChart data={byBait} color="#0891b2" layout="vertical" height={Math.max(200, byBait.length * 36)} />
            </ChartSection>
          )}

          {byHook.length > 0 && (
            <ChartSection icon={Anchor} title={t("stats.byHook")}>
              <StatsChart data={byHook} color="#f59e0b" layout="vertical" height={Math.max(200, byHook.length * 36)} />
            </ChartSection>
          )}

          {byLine.length > 0 && (
            <ChartSection icon={Ruler} title={t("stats.byLine")}>
              <StatsChart data={byLine} color="#8b5cf6" layout="vertical" height={Math.max(200, byLine.length * 36)} />
            </ChartSection>
          )}

          {byFeeder.length > 0 && (
            <ChartSection icon={Waves} title={t("stats.byFeeder")}>
              <StatsChart data={byFeeder} color="#ec4899" layout="vertical" height={Math.max(200, byFeeder.length * 36)} />
            </ChartSection>
          )}

          {byTemp.length > 0 && (
            <ChartSection icon={Thermometer} title={t("stats.byTemp")}>
              <StatsChart data={byTemp} color="#ef4444" />
            </ChartSection>
          )}

          {byCloudiness.length > 0 && (
            <ChartSection icon={Cloud} title={t("stats.byCloudiness")}>
              <StatsChart data={byCloudiness} color="#64748b" />
            </ChartSection>
          )}

          {byWind.length > 0 && (
            <ChartSection icon={Wind} title={t("stats.byWind")}>
              <StatsChart data={byWind} color="#0ea5e9" />
            </ChartSection>
          )}

          {byDistance.length > 0 && (
            <ChartSection icon={Gauge} title={t("stats.byDistance")}>
              <StatsChart data={byDistance} color="#0891b2" layout="vertical" height={Math.max(200, byDistance.length * 36)} />
            </ChartSection>
          )}
        </>
      )}
    </div>
  );
}