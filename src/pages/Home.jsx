import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Fish, Timer, PlusCircle, Loader2, ChevronRight } from "lucide-react";
import CatchTrendChart from "@/components/CatchTrendChart";

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

export default function Home() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadCatches = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listCatchesByUser(user.id);
      setCatches(data);
    } catch {
      toast({ title: t("dashboard.couldNotLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t, user]);

  useEffect(() => {
    loadCatches();
  }, [loadCatches, user?.id]);

  const totalCatches = catches.length;
  const avgDuration =
    totalCatches > 0
      ? Math.round(catches.reduce((sum, c) => sum + (c.duration || 0), 0) / totalCatches)
      : 0;
  const totalWeight = catches.reduce((sum, c) => sum + (c.weight || 0), 0);
  const recentCatches = catches.slice(0, 5);

  // v2.66 — Home used to render its own <AdBanner/> here on top of the one
  // Layout.jsx already renders globally (above <Outlet/>, inside the sticky
  // header, for every page). That meant the Home page's top banner was
  // mounted twice — the same ad/slot placeholder showing up as what looked
  // like "two banners", with only one of them (the real, singular
  // underlying CustomAd/AdSlot) actually editable anywhere. Removed the
  // duplicate; the global one in Layout.jsx already covers this page like
  // every other.
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-400">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-4 text-white shadow-lg">
          <p className="text-cyan-100 text-xs font-medium uppercase tracking-wide">{t("dashboard.catches")}</p>
          <p className="text-2xl font-black mt-1">{totalCatches}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t("dashboard.avgFight")}</p>
          <p className="text-2xl font-black mt-1 text-slate-700">{formatDuration(avgDuration)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t("dashboard.weight")}</p>
          <p className="text-2xl font-black mt-1 text-slate-700">
            {totalWeight.toFixed(1)}
            <span className="text-sm text-slate-400 ml-0.5">kg</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/active-session"
          className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-cyan-300 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center">
            <Timer className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm">{t("dashboard.activeSession")}</div>
            <div className="text-xs text-slate-400">{t("dashboard.liveTimers")}</div>
          </div>
        </Link>
        <Link
          to="/log-catch"
          className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-cyan-300 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <PlusCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm">{t("dashboard.logCatch")}</div>
            <div className="text-xs text-slate-400">{t("dashboard.manualEntry")}</div>
          </div>
        </Link>
      </div>

      <CatchTrendChart catches={catches} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("dashboard.recentCatches")}</h2>
          <Link to="/catch-history" className="text-xs text-cyan-600 flex items-center hover:underline">
            {t("dashboard.viewAll")} <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : recentCatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Fish className="w-10 h-10 text-slate-200 mb-2" />
            <p className="text-slate-400 text-sm">{t("dashboard.noCatches")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCatches.map((c) => (
              <Link
                key={c.id}
                to={`/catch-details?id=${c.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ${c.rod === 2 ? "bg-emerald-500" : "bg-cyan-500"}`}>
                  R{c.rod}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">{c.species || t("common.unknown")}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {formatDuration(c.duration)}
                    {c.weight ? ` · ${c.weight} kg` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}