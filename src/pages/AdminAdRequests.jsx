import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Check, X, Megaphone, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const PLACEMENT_KEYS = {
  all: "nav.allPages",
  home: "nav.home",
  session: "nav.activeSession",
  history: "nav.catchHistory",
  statistics: "nav.statistics",
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

export default function AdminAdRequests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const PLACEMENT_LABELS = {};
  for (const k in PLACEMENT_KEYS) PLACEMENT_LABELS[k] = t(PLACEMENT_KEYS[k]);
  const STATUS_LABELS = {};
  for (const k in STATUS_KEYS) STATUS_LABELS[k] = t(STATUS_KEYS[k]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await base44.entities.AdSlotRequest.list("-created_date", 200);
      setRequests(data || []);
    } catch (e) {
      toast({ title: t("aar.loadError"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  // There is no payment processor wired up (Stripe was removed entirely —
  // see server/README.md); payment is settled manually (Revolut/bank
  // transfer, per the Настройка на интеграциите → Начини на плащане
  // config), so "approve" just tells the advertiser how to pay, and a
  // separate "mark as paid" step below is what an admin uses once the
  // money has actually arrived.
  async function approve(req) {
    setApproving(req.id);
    try {
      const payment = await base44.settings.getPaymentInfo().catch(() => null);
      const lines = [
        t("aar.emailIntro")
          .replace("{slotName}", req.ad_slot_name)
          .replace("{months}", req.months)
          .replace("{totalPrice}", req.total_price),
      ];
      if (payment?.revolut?.enabled) {
        lines.push(`${t("adv.payRevolut")}: ${payment.revolut.url || "@" + payment.revolut.tag}`);
      }
      if (payment?.bank?.enabled) {
        const holderPart = payment.bank.holder ? `${t("adv.payHolder")}: ${payment.bank.holder}, ` : "";
        const bicPart = payment.bank.bic ? `, BIC/SWIFT: ${payment.bank.bic}` : "";
        lines.push(`${t("adv.payBankTransfer")}: ${holderPart}IBAN ${payment.bank.iban}${bicPart}`);
      }
      if (!payment?.revolut?.enabled && !payment?.bank?.enabled) {
        lines.push(t("aar.emailNoPaymentConfigured"));
      }
      if (payment?.note) lines.push(payment.note);
      lines.push(t("aar.emailOutro"));

      await base44.entities.AdSlotRequest.update(req.id, { status: "approved" });

      await base44.integrations.Core.SendEmail({
        to: req.advertiser_email,
        subject: t("aar.emailSubject"),
        body: lines.join("\n\n"),
      });

      toast({ title: t("aar.approvedWithEmail") });
      await load();
    } catch (e) {
      toast({ title: t("aar.approveError"), description: e.message, variant: "destructive" });
    } finally {
      setApproving(null);
    }
  }

  // The manual counterpart to the payment: once the admin has actually
  // seen the money land (Revolut/bank), this just flips the record to
  // "paid" — it does NOT auto-create the live CustomAd. That still has to
  // be done by hand in the ad management screen (see AdManagement.jsx)
  // exactly like every other ad on this platform.
  async function markPaid(req) {
    setMarkingPaid(req.id);
    try {
      await base44.entities.AdSlotRequest.update(req.id, { status: "paid" });
      toast({ title: t("aar.markedPaid"), description: t("aar.markedPaidHint") });
      await load();
    } catch (e) {
      toast({ title: t("aar.markPaidError"), description: e.message, variant: "destructive" });
    } finally {
      setMarkingPaid(null);
    }
  }

  async function reject(req) {
    try {
      await base44.entities.AdSlotRequest.update(req.id, { status: "rejected" });
      toast({ title: t("aar.rejected") });
      await load();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const others = requests.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("aar.title")}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("aar.pending")} ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400">{t("aar.noPending")}</p>
            ) : (
              pending.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 dark:text-foreground">{r.ad_slot_name}</p>
                      <p className="text-xs text-slate-400 truncate">{r.advertiser_email}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 font-medium whitespace-nowrap">
                      {PLACEMENT_LABELS[r.placement] || r.placement}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">{t("aar.website")}:</span> <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline">{r.website_url}</a></div>
                    <div><span className="text-slate-400">{t("aar.months")}:</span> {r.months}</div>
                    <div><span className="text-slate-400">{t("aar.pricePerMonth")}:</span> €{r.price_per_month}</div>
                    <div><span className="text-slate-400">{t("aar.total")}:</span> <span className="font-bold">€{r.total_price}</span></div>
                  </div>
                  {r.additional_info && <p className="text-sm text-slate-600 dark:text-muted-foreground">{r.additional_info}</p>}
                  {r.logo_url && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{t("aar.logo")}:</span>
                      <img src={r.logo_url} alt="Лого" className="w-12 h-12 rounded bg-white border border-slate-200 object-contain p-0.5" />
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => approve(r)} disabled={approving === r.id} size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[40px]">
                      {approving === r.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} {t("awb.approve")}
                      </Button>
                      <Button onClick={() => reject(r)} variant="outline" size="sm" className="min-h-[40px]">
                      <X className="w-4 h-4 mr-1" /> {t("awb.reject")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {others.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("aar.resolved")} ({others.length})</h2>
              {others.map((r) => (
                <div key={r.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-800 dark:text-foreground truncate">{r.ad_slot_name}</p>
                    <p className="text-xs text-slate-400 truncate">{r.advertiser_email} · €{r.total_price}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[r.status] || "bg-slate-100"}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                    {r.checkout_url && r.status === "approved" && (
                      <a href={r.checkout_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent">
                        <ExternalLink className="w-4 h-4 text-cyan-600" />
                      </a>
                    )}
                    {r.status === "approved" && (
                      <Button
                        onClick={() => markPaid(r)}
                        disabled={markingPaid === r.id}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 min-h-[36px]"
                      >
                        {markingPaid === r.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                        {t("aar.markPaid")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}