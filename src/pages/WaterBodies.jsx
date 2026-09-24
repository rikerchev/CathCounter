import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Waves, PlusCircle, MapPin, Phone, Fish, ShieldCheck, Clock, Globe } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";
// v3.61 — same Country filter dropdown as CommercialVenues.jsx; see its own
// comment. Every approved water body already has `country` available (it's
// been a required field in WaterBodyEditDialog.jsx since before this
// version) — this page just didn't offer any way to filter by it yet.
import { COUNTRY_GROUPS, COUNTRY_NAME_BY_CODE } from "@/lib/countries";

export default function WaterBodies() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [waterBodies, setWaterBodies] = useState([]);
  const [loading, setLoading] = useState(true);
  // v3.61 — "" = all countries.
  const [countryFilter, setCountryFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.WaterBody.list();
      setWaterBodies((all || []).filter((w) => w.status === "approved"));
    } catch (e) {
      toast({ title: t("wbs.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredWaterBodies = useMemo(
    () => (countryFilter ? waterBodies.filter((w) => w.country === countryFilter) : waterBodies),
    [waterBodies, countryFilter]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-6 h-6 text-cyan-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("wbs.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Link
              to="/admin-traders"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 min-h-[44px]"
            >
              <ShieldCheck className="w-4 h-4" /> {t("wbs.approvals")}
            </Link>
          )}
          <Link
            to="/merchant-request?type=water_body"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4" /> {t("wbs.request")}
          </Link>
        </div>
      </div>

      {!loading && waterBodies.length > 0 && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-muted-foreground">
            <Globe className="w-3.5 h-3.5" /> {t("wbd.country")}
          </label>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm dark:bg-card dark:text-foreground"
          >
            <option value="">{t("common.allCountries")}</option>
            {COUNTRY_GROUPS.map((group) => (
              <optgroup key={group.language} label={group.label}>
                {group.countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : filteredWaterBodies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Fish className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">{t("wbs.noWaterBodies")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWaterBodies.map((w) => (
            <div
              key={w.id}
              className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800 dark:text-foreground">{w.name}</h2>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3 h-3" />
                    {[w.location, w.country ? COUNTRY_NAME_BY_CODE[w.country] : null].filter(Boolean).join(", ")}
                  </div>
                </div>
                {w.max_depth != null && (
                  <span className="text-xs px-2 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-accent dark:text-cyan-400 whitespace-nowrap">
                    {w.max_depth} {lang === "bg" ? "м" : "m"} {t("wbs.depth")}
                  </span>
                )}
              </div>

              {w.fish_population && (
                <p className="text-sm text-slate-600 dark:text-muted-foreground mt-3">
                  <span className="font-medium text-slate-700 dark:text-foreground">{t("wbs.population")}</span>{" "}
                  {w.fish_population}
                </p>
              )}
              {w.usage_conditions && (
                <p className="text-sm text-slate-600 dark:text-muted-foreground mt-2">
                  <span className="font-medium text-slate-700 dark:text-foreground">{t("wbs.conditions")}</span>{" "}
                  {w.usage_conditions}
                </p>
              )}

              <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
                {w.capacity && <span>{t("wbs.capacity")} {w.capacity}</span>}
                {w.fee_per_person != null && w.fee_per_person > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {t("wbs.fee")} {w.fee_per_person} €{lang === "bg" ? "/човек" : "/person"}
                  </span>
                )}
                {w.contact_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {w.contact_phone}
                  </span>
                )}
                {w.working_hours && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {w.working_hours}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  to={`/competitions?water_body=${w.id}`}
                  className="inline-flex items-center text-xs text-cyan-600 hover:underline"
                >
                  {t("wbs.seeCompetitions")}
                </Link>
                <Link
                  to={`/sector-reservations?water_body=${w.id}`}
                  className="inline-flex items-center text-xs text-emerald-600 hover:underline"
                >
                  {t("wbs.reserveSector")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}