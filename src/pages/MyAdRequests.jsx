import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Megaphone, ExternalLink, Loader2, Globe, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countries";
import AdRequestEditDialog from "@/components/AdRequestEditDialog";
import PaymentInfoCard from "@/components/PaymentInfoCard";
import { useLanguage } from "@/lib/i18n";

const PLACEMENT_KEYS = {
  all: "nav.allPages",
  home: "nav.home",
  session: "nav.activeSession",
  log_catch: "nav.logCatch",
  history: "nav.catchHistory",
  sessions: "nav.sessions",
  statistics: "nav.statistics",
  locations: "nav.locations",
  personal_best: "nav.personalBest",
  bait_inventory: "nav.tackleInventory",
  water_bodies: "nav.waterBodies",
  competitions: "nav.competitions",
  sector_reservations: "nav.sectorReservations",
  advertise: "nav.advertise",
  profile: "nav.profile",
};

const STATUS_KEYS = {
  pending: "aar.statusPending",
  approved: "aar.statusApproved",
  rejected: "aar.statusRejected",
  paid: "aar.statusPaid",
  cancelled: "aar.statusCancelled",
};

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-cyan-100 text-cyan-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function MyAdRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const PLACEMENT_LABELS = {};
  for (const k in PLACEMENT_KEYS) PLACEMENT_LABELS[k] = t(PLACEMENT_KEYS[k]);
  const STATUS_LABELS = {};
  for (const k in STATUS_KEYS) STATUS_LABELS[k] = t(STATUS_KEYS[k]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRequest, setEditingRequest] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    loadRequests();
  }, [user]);

  async function loadRequests() {
    try {
      const data = await base44.entities.AdSlotRequest.filter(
        { created_by_id: user.id },
        "-created_date",
        100
      );
      setRequests(data || []);
    } catch (e) {
      toast({ title: t("aar.loadError"), description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(data) {
    try {
      await base44.entities.AdSlotRequest.update(editingRequest.id, data);
      toast({ title: t("common.save") });
      setEditingRequest(null);
      await loadRequests();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("aar.myRequests")}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-slate-400 text-sm">{t("aar.noRequests")}</p>
          <Button asChild className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
            <a href="/advertise">{t("aar.requestBanner")}</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-800 dark:text-foreground">{r.ad_slot_name}</p>
                  <p className="text-xs text-slate-400">{PLACEMENT_LABELS[r.placement] || r.placement}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[r.status] || "bg-slate-100"}`}>
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">{t("aar.months")}:</span> {r.months}</div>
                <div><span className="text-slate-400">{t("aar.total")}:</span> <span className="font-bold">€{r.total_price}</span></div>
              </div>
              {r.countries && (
                <div className="text-xs">
                  <span className="text-slate-400 flex items-center gap-1"><Globe className="w-3 h-3" /> {t("aar.countries")}:</span>
                  <span className="text-slate-600 dark:text-muted-foreground">
                    {r.countries === "all"
                      ? t("aar.allCountries")
                      : r.countries.split(",").map((c) => COUNTRY_NAME_BY_CODE[c] || c).join(", ")}
                  </span>
                </div>
              )}
              {r.website_url && (
                <div className="text-xs">
                  <span className="text-slate-400">{t("aar.website")}:</span>{" "}
                  <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline">{r.website_url}</a>
                </div>
              )}
              {r.status === "approved" && (
                <div className="space-y-2">
                  {r.checkout_url && (
                    <Button asChild className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] w-full">
                      <a href={r.checkout_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" /> {t("aar.payNow")} (€{r.total_price})
                      </a>
                    </Button>
                  )}
                  <PaymentInfoCard />
                </div>
              )}
              {r.status === "pending" && (
                <p className="text-xs text-amber-600">{t("aar.pendingReview")}</p>
              )}
              {r.status === "rejected" && (
                <p className="text-xs text-red-600">{t("aar.rejectedDesc")}</p>
              )}
              {r.status === "paid" && (
                <p className="text-xs text-emerald-600">{t("aar.paidDesc")}</p>
              )}
              {(r.status === "pending" || r.status === "approved") && (
                <Button
                  variant="outline"
                  onClick={() => setEditingRequest(r)}
                  className="min-h-[44px] w-full"
                >
                  <Pencil className="w-4 h-4 mr-1" /> {t("aar.editTitleDesc")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {editingRequest && (
        <AdRequestEditDialog
          request={editingRequest}
          onClose={() => setEditingRequest(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}