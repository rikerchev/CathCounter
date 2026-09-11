import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Loader2, Fish, ChevronRight } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { listCatchesByUser } from "@/lib/catchRepository";
import { parseCatchDate } from "@/lib/dateUtils";
import { translateSpecies } from "@/lib/speciesUtils";

const formatDuration = (s) => {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export default function CatchHistory() {
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

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("history.title")}</h1>
        <p className="text-sm text-slate-400">
          {catches.length} {catches.length === 1 ? t("history.catchLogged") : t("history.catchesLogged")}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : catches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Fish className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">{t("history.noCatches")}</p>
          <p className="text-slate-300 text-sm mt-1">{t("history.logToStart")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {catches.map((c) => {
            const formattedDate = c.date || c.created_date
              ? parseCatchDate(c).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                })
              : "";
            return (
              <Link
                key={c.id}
                to={`/catch-details?id=${c.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${c.rod === 2 ? "bg-emerald-500" : "bg-cyan-500"}`}>
                  R{c.rod}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{translateSpecies(c.species, t) || t("common.unknown")}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {formatDuration(c.duration)}
                    {c.weight ? ` · ${c.weight} kg` : ""}
                    {c.bait ? ` · ${c.bait}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
                  </div>
                  {formattedDate && <div className="text-xs text-slate-300 mt-0.5">{formattedDate}</div>}
                </div>
                {c.photo_url && (
                  <Thumbnail src={c.photo_url} alt="catch" width={48} height={48} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                )}
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}