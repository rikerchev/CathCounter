import React, { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fish, Waves, Tag, Anchor, Ruler, Lightbulb, MapPin, Thermometer, Cloud, Wind, Gauge } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function SmartRecommendations({ catches }) {
  const { t } = useLanguage();
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterDistance, setFilterDistance] = useState("all");
  const [filterCloudiness, setFilterCloudiness] = useState("all");
  const [tempMin, setTempMin] = useState("");
  const [tempMax, setTempMax] = useState("");
  const [windMin, setWindMin] = useState("");
  const [windMax, setWindMax] = useState("");

  const locations = useMemo(() => {
    const set = new Set(catches.map((c) => c.location).filter(Boolean));
    return Array.from(set);
  }, [catches]);

  const distances = useMemo(() => {
    const set = new Set(catches.map((c) => c.distance).filter(Boolean));
    return Array.from(set);
  }, [catches]);

  const filtered = useMemo(() => {
    return catches.filter((c) => {
      if (filterLocation !== "all" && c.location !== filterLocation) return false;
      if (filterDistance !== "all" && c.distance !== filterDistance) return false;
      if (filterCloudiness !== "all" && c.cloudiness !== filterCloudiness) return false;
      if (tempMin && (c.air_temperature == null || c.air_temperature < parseFloat(tempMin))) return false;
      if (tempMax && (c.air_temperature == null || c.air_temperature > parseFloat(tempMax))) return false;
      if (windMin && (c.wind_speed == null || c.wind_speed < parseFloat(windMin))) return false;
      if (windMax && (c.wind_speed == null || c.wind_speed > parseFloat(windMax))) return false;
      return true;
    });
  }, [catches, filterLocation, filterDistance, filterCloudiness, tempMin, tempMax, windMin, windMax]);

  const topItem = (key) => {
    const map = {};
    filtered.forEach((c) => {
      const val = c[key];
      if (!val) return;
      map[val] = (map[val] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? entries[0] : null;
  };

  const recommendations = [
    { key: "distance", label: t("rod.distance"), icon: Gauge, color: "text-sky-600" },
    { key: "feeder", label: t("rod.groundbait"), icon: Waves, color: "text-cyan-600" },
    { key: "bait", label: t("rod.bait"), icon: Tag, color: "text-amber-600" },
    { key: "hook_size", label: t("rod.hook"), icon: Anchor, color: "text-rose-600" },
    { key: "line", label: t("rod.line"), icon: Ruler, color: "text-violet-600" },
    { key: "rod_model", label: t("rod.model"), icon: Fish, color: "text-emerald-600" },
  ];

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("stats.recommendations")}</h2>
      </div>

      <p className="text-xs text-slate-400">{t("stats.recommendationsHint")}</p>

      {/* Filters */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {t("rod.location")}
            </Label>
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="h-9 text-sm min-h-[40px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tackle.all")}</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> {t("rod.distance")}
            </Label>
            <Select value={filterDistance} onValueChange={setFilterDistance}>
              <SelectTrigger className="h-9 text-sm min-h-[40px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tackle.all")}</SelectItem>
                {distances.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Cloud className="w-3 h-3" /> {t("weather.cloudiness")}
            </Label>
            <Select value={filterCloudiness} onValueChange={setFilterCloudiness}>
              <SelectTrigger className="h-9 text-sm min-h-[40px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tackle.all")}</SelectItem>
                {["clear", "partly_cloudy", "cloudy", "overcast"].map((c) => (
                  <SelectItem key={c} value={c}>{t(`cloudiness.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Thermometer className="w-3 h-3" /> {t("weather.airTemp")} (min–max)
            </Label>
            <div className="flex gap-1">
              <Input type="number" value={tempMin} onChange={(e) => setTempMin(e.target.value)} placeholder="0" className="h-9 text-sm" />
              <Input type="number" value={tempMax} onChange={(e) => setTempMax(e.target.value)} placeholder="30" className="h-9 text-sm" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Wind className="w-3 h-3" /> {t("weather.windSpeed")} (min–max)
            </Label>
            <div className="flex gap-1">
              <Input type="number" value={windMin} onChange={(e) => setWindMin(e.target.value)} placeholder="0" className="h-9 text-sm" />
              <Input type="number" value={windMax} onChange={(e) => setWindMax(e.target.value)} placeholder="10" className="h-9 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {t("stats.basedOn")} {filtered.length} {t("stats.catches")}
          </p>
          <div className="grid grid-cols-1 gap-2">
            {recommendations.map(({ key, label, icon: Icon, color }) => {
              const top = topItem(key);
              return (
                <div key={key} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                  <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="font-semibold text-slate-700 truncate">{top ? top[0] : "—"}</div>
                  </div>
                  {top && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                      {top[1]} {t("stats.catches")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">{t("stats.noMatch")}</p>
      )}
    </div>
  );
}