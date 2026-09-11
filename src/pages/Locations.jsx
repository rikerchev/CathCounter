import React, { useState, useEffect, useCallback } from "react";
import { Loader2, MapPin, Fish, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { listCatchesByUser } from "@/lib/catchRepository";

const formatDuration = (s) => {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export default function Locations() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setCatches(await listCatchesByUser(user.id));
    } catch {
      toast({ title: t("history.couldNotLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t, user]);

  useEffect(() => { load(); }, [load]);

  const locations = (() => {
    const map = {};
    catches.forEach((c) => {
      if (!c.location) return;
      if (!map[c.location]) {
        map[c.location] = { location: c.location, count: 0, weight: 0, duration: 0, catches: [] };
      }
      map[c.location].count += 1;
      map[c.location].weight += c.weight || 0;
      map[c.location].duration += c.duration || 0;
      map[c.location].catches.push(c);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("locations.title")}</h1>
        <p className="text-sm text-slate-400">
          {locations.length} {t("locations.spots")}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MapPin className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">{t("locations.noLocations")}</p>
          <p className="text-slate-300 text-sm mt-1">{t("locations.logWithLocation")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((loc) => (
            <div key={loc.location} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-cyan-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800">{loc.location}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span>{loc.count} {loc.count === 1 ? t("history.catchLogged") : t("history.catchesLogged")}</span>
                    <span>{loc.weight.toFixed(1)} kg</span>
                    <span>{t("locations.avg")} {formatDuration(Math.round(loc.duration / loc.count))}</span>
                  </div>
                </div>
              </div>
              {loc.catches.slice(0, 3).map((c) => (
                <Link key={c.id} to={`/catch-details?id=${c.id}`} className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50 text-sm text-slate-500 hover:text-cyan-600">
                  <Fish className="w-3.5 h-3.5" />
                  <span className="flex-1 truncate">
                    {c.species || t("common.unknown")} — {formatDuration(c.duration)}
                    {c.weight ? ` · ${c.weight} kg` : ""}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}