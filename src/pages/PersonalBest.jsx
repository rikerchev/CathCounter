import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trophy, Weight } from "lucide-react";
import Thumbnail from "@/components/Thumbnail";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { listCatchesByUser } from "@/lib/catchRepository";
import { translateSpecies } from "@/lib/speciesUtils";

export default function PersonalBest() {
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

  const trophies = catches
    .filter((c) => c.weight || c.photo_url)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const biggest = trophies[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("best.title")}</h1>
        <p className="text-sm text-slate-400">{t("best.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : trophies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">{t("best.noTrophies")}</p>
          <p className="text-slate-300 text-sm mt-1">{t("best.logTrophy")}</p>
        </div>
      ) : (
        <>
          {biggest && (
            <Link
              to={`/catch-details?id=${biggest.id}`}
              className="block rounded-2xl overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white shadow-xl"
            >
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5" />
                <span className="font-bold uppercase tracking-wide text-sm">{t("best.biggestCatch")}</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black">{biggest.weight ? biggest.weight : "—"}</span>
                <span className="text-lg mb-0.5">kg</span>
              </div>
              <p className="text-amber-50 text-sm mt-1">
                {translateSpecies(biggest.species, t) || t("common.unknown")}
                {biggest.location ? ` · ${biggest.location}` : ""}
              </p>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3">
            {trophies.map((c, i) => (
              <Link
                key={c.id}
                to={`/catch-details?id=${c.id}`}
                className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {c.photo_url ? (
                  <Thumbnail src={c.photo_url} alt="catch" width={300} height={128} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
                    <Weight className="w-8 h-8 text-slate-300" />
                  </div>
                )}
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-amber-600">#{i + 1}</span>
                    <span className="text-sm font-semibold text-slate-800 truncate">{translateSpecies(c.species, t) || t("common.unknown")}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.weight ? `${c.weight} kg` : t("best.noWeight")}
                    {c.location ? ` · ${c.location}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}