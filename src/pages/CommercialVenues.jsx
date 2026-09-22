import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Store, MapPin, Phone, Mail, Globe, Image as ImageIcon, PlusCircle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";

/**
 * CommercialVenues — public "Търговски обекти" browse page (v2.71).
 * Analogous to WaterBodies.jsx: anyone (not just admins/owners) can see the
 * list of active venues here and reach out to them (phone/email/website) —
 * this is deliberately separate from TraderVenues.jsx, which is the
 * water_owner/admin's own management screen (brochure QR + bonus ad-time
 * config) under Търговци. Same relationship as /water-bodies (public) vs
 * /water-body-management (owner admin).
 */
export default function CommercialVenues() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.Venue.list();
      // v2.77 — venues now go through the same admin-approval workflow as
      // water bodies (status undefined on an old row, from before this
      // column existed, is treated as approved — see the v2.77 migration's
      // DEFAULT 'approved', which backfills exactly that for existing rows).
      setVenues((all || []).filter((v) => v.is_active !== false && v.status !== "pending" && v.status !== "rejected"));
    } catch (e) {
      toast({ title: t("cv.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Store className="w-6 h-6 text-cyan-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("cv.title")}</h1>
        </div>
        <Link
          to="/merchant-request?type=venue"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 min-h-[44px]"
        >
          <PlusCircle className="w-4 h-4" /> {t("cv.register")}
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : venues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Store className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">{t("cv.noVenues")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <div
              key={v.id}
              className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {v.logo_url ? (
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-card border border-slate-100 dark:border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={v.logo_url} alt={v.name} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-accent flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-5 h-5 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-800 dark:text-foreground truncate">{v.name}</h2>
                  {v.address && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{v.address}</span>
                    </div>
                  )}
                  {v.working_hours && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <Clock className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{v.working_hours}</span>
                    </div>
                  )}
                </div>
              </div>

              {(v.contact_phone || v.contact_email || v.website) && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {v.contact_phone && (
                    <a
                      href={`tel:${v.contact_phone}`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-accent text-slate-600 dark:text-muted-foreground hover:bg-slate-100 min-h-[36px]"
                    >
                      <Phone className="w-3.5 h-3.5" /> {v.contact_phone}
                    </a>
                  )}
                  {v.contact_email && (
                    <a
                      href={`mailto:${v.contact_email}`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-accent text-slate-600 dark:text-muted-foreground hover:bg-slate-100 min-h-[36px]"
                    >
                      <Mail className="w-3.5 h-3.5" /> {t("cv.email")}
                    </a>
                  )}
                  {v.website && (
                    <a
                      href={/^https?:\/\//i.test(v.website) ? v.website : `https://${v.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 min-h-[36px]"
                    >
                      <Globe className="w-3.5 h-3.5" /> {t("cv.visitWebsite")}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
