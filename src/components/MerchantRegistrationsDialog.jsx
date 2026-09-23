import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";

function formatDateTime(d, lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * MerchantRegistrationsDialog — v3.51. Shared by TraderVenues.jsx (venues)
 * and WaterBodyManagement.jsx (water bodies): shows every user who ever
 * redeemed THIS merchant's own QR/brochure code, oldest first, with a
 * sequential number — so an owner/admin can see who's actually driving
 * signups through a given merchant, to plan extra bonuses for whoever
 * refers the most (the request this was built for). Fetches fresh from
 * server/routes/merchantReferrals.ts's `registrations` action every time
 * it's opened — this is a small, occasionally-viewed admin/owner list, not
 * something that needs caching or offline support like the ad banners do.
 */
export default function MerchantRegistrationsDialog({ merchantType, merchantId, merchantName, open, onOpenChange, onLoaded }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [registrations, setRegistrations] = useState([]);

  useEffect(() => {
    if (!open || !merchantType || !merchantId) return;
    setLoading(true);
    base44.merchantReferrals
      .registrations(merchantType, merchantId)
      .then((data) => {
        const list = data?.registrations || [];
        setRegistrations(list);
        // v3.53 — the "Регистрации (N)" count badge on the button that
        // opened this dialog (see TraderVenues.jsx/WaterBodyManagement.jsx)
        // is seeded once from a batch /counts call on page load, but that
        // can go stale the moment a new registration lands while the admin
        // already has the page open. Reporting the actually-fetched count
        // back up here — for free, from a request already being made to
        // fill this exact dialog — keeps the badge correct without a
        // second network call.
        if (typeof onLoaded === "function") onLoaded(list.length);
      })
      .catch((e) => {
        toast({ title: t("mr.registrationsError"), description: e.message, variant: "destructive" });
        setRegistrations([]);
      })
      .finally(() => setLoading(false));
  }, [open, merchantType, merchantId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-600" />
            {t("mr.registrationsTitle")}
          </DialogTitle>
          {merchantName && <p className="text-xs text-slate-400">{merchantName}</p>}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-cyan-600 animate-spin" />
          </div>
        ) : registrations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{t("mr.registrationsEmpty")}</p>
        ) : (
          <div className="space-y-1.5">
            {registrations.map((r, i) => (
              <div
                key={r.referred_id}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-accent px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-slate-400 shrink-0 w-6 text-right">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-foreground truncate">
                      {r.full_name || r.email}
                    </p>
                    {r.full_name && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                  {formatDateTime(r.created_at, lang)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
