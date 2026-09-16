import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Store, Check, X, UserCog, Waves, Download, Loader2, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { effectiveRoles, highestRole } from "@/lib/roles";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import MerchantBonusEditor from "@/components/MerchantBonusEditor";
import { useLanguage } from "@/lib/i18n";

// v2.77 — admin-only "Търговци" screen. Replaces AdminWaterBodies.jsx with a
// single merged approval queue for BOTH water bodies and commercial venues
// (previously venues never needed approval at all — see the v2.77 migration
// that added `venues.status`). Also the one place an admin now manages
// per-merchant bonus ad-time, brochure download, and reassigning which
// registered user owns a given object — none of that lives in the
// owner-facing "Одобрени търговци" pages anymore (WaterBodyManagement.jsx /
// TraderVenues.jsx), which always show only the signed-in user's own
// objects, admin or not.
export default function AdminTraders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState("");
  const [reassignEmail, setReassignEmail] = useState({});
  const [reassigningId, setReassigningId] = useState("");

  const load = useCallback(async () => {
    try {
      const [wbList, venueList] = await Promise.all([
        base44.entities.WaterBody.list(),
        base44.entities.Venue.list(),
      ]);
      const merged = [
        ...(wbList || []).map((w) => ({ ...w, _type: "water_body" })),
        ...(venueList || []).map((v) => ({ ...v, _type: "venue" })),
      ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setItems(merged);
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  // Same role-grant logic as AdminRoleRequests.jsx's approve() / the old
  // AdminWaterBodies.jsx: fold the current role scalar in first
  // (effectiveRoles) before adding "water_owner" so an admin who happens to
  // also be the merchant being approved never loses their admin role — see
  // roles.js's own comment for why that matters.
  async function grantMerchantRole(userId) {
    if (!userId) return;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      const u = users && users[0];
      if (!u) return;
      const currentRoles = effectiveRoles(u);
      const newRoles = currentRoles.includes("water_owner") ? currentRoles : [...currentRoles, "water_owner"];
      const newRole = highestRole(newRoles);
      await base44.asServiceRole.entities.User.update(u.id, { roles: newRoles, role: newRole });
    } catch (e) {
      console.error("Failed to grant merchant role:", e);
    }
  }

  async function setStatus(item, status) {
    try {
      if (item._type === "water_body") {
        await base44.entities.WaterBody.update(item.id, { status });
      } else {
        await base44.entities.Venue.update(item.id, { status });
      }
      if (status === "approved" && item.created_by_id) {
        await grantMerchantRole(item.created_by_id);
      }
      toast({ title: status === "approved" ? t("awb.approved") : t("awb.rejected") });
      await load();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function handleDownload(item) {
    setDownloadingId(item.id);
    try {
      await downloadInviteBrochure({
        name: item.name,
        link: getMerchantBrochureLink(item._type, item.id),
        filename: `catchcount-broshura-${(item.name || "obekt").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.pdf`,
      });
    } catch (e) {
      toast({ title: t("tv.brochureFailed"), description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId("");
    }
  }

  async function reassignOwner(item) {
    const email = (reassignEmail[item.id] || "").trim();
    if (!email) return;
    setReassigningId(item.id);
    try {
      const users = await base44.entities.User.filter({ email });
      const target = users && users[0];
      if (!target) {
        toast({ title: t("at.userNotFound"), variant: "destructive" });
        return;
      }
      await base44.admin.merchants.reassignOwner(item._type, item.id, target.id);
      await grantMerchantRole(target.id);
      toast({ title: t("at.ownerChanged") });
      setReassignEmail((f) => ({ ...f, [item.id]: "" }));
      await load();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    } finally {
      setReassigningId("");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  const pending = items.filter((i) => i.status === "pending");
  const others = items.filter((i) => i.status !== "pending");

  function TypeBadge({ type }) {
    return type === "water_body" ? (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
        <Waves className="w-3 h-3" /> {t("mr.typeWaterBody")}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Store className="w-3 h-3" /> {t("mr.typeVenue")}
      </span>
    );
  }

  function ItemCard({ item, showActions }) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-800 dark:text-foreground truncate">{item.name}</h3>
              <TypeBadge type={item._type} />
            </div>
            <p className="text-xs text-slate-400">{item._type === "water_body" ? item.location : item.address}</p>
          </div>
          {item.status !== "pending" && (
            <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
              item.status === "approved"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            }`}>
              {item.status === "approved" ? t("awb.statusApproved") : t("awb.statusRejected")}
            </span>
          )}
        </div>

        {item._type === "water_body" && (
          <div className="text-sm text-slate-600 dark:text-muted-foreground space-y-1">
            {item.owner_name && <p>{t("awb.owner")}: {item.owner_name}</p>}
            {item.contact_phone && <p>{t("awb.phone")}: {item.contact_phone}</p>}
            {item.contact_email && <p>{t("awb.email")}: {item.contact_email}</p>}
            {item.fish_population && <p>{t("awb.population")}: {item.fish_population}</p>}
          </div>
        )}
        {item._type === "venue" && (item.contact_phone || item.contact_email) && (
          <div className="text-sm text-slate-600 dark:text-muted-foreground space-y-1">
            {item.contact_phone && <p>{t("awb.phone")}: {item.contact_phone}</p>}
            {item.contact_email && <p>{t("awb.email")}: {item.contact_email}</p>}
          </div>
        )}

        {showActions ? (
          <div className="flex gap-2">
            <Button onClick={() => setStatus(item, "approved")} size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[40px]">
              <Check className="w-4 h-4 mr-1" /> {t("awb.approve")}
            </Button>
            <Button onClick={() => setStatus(item, "rejected")} variant="outline" size="sm" className="min-h-[40px]">
              <X className="w-4 h-4 mr-1" /> {t("awb.reject")}
            </Button>
          </div>
        ) : (
          <>
            <Button
              onClick={() => handleDownload(item)}
              size="sm"
              variant="outline"
              disabled={downloadingId === item.id}
              className="min-h-[40px]"
            >
              {downloadingId === item.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              {t("tv.downloadBrochure")}
            </Button>

            <MerchantBonusEditor
              merchant={item}
              merchantType={item._type}
              onSaved={(patch) => setItems((prev) => prev.map((x) => (x.id === item.id && x._type === item._type ? { ...x, ...patch } : x)))}
            />

            <div className="rounded-xl bg-slate-50 dark:bg-accent p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5" /> {t("at.reassignOwner")}
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder={t("at.ownerEmailPlaceholder")}
                  value={reassignEmail[item.id] || ""}
                  onChange={(e) => setReassignEmail((f) => ({ ...f, [item.id]: e.target.value }))}
                  className="min-h-[40px] text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reassigningId === item.id || !reassignEmail[item.id]}
                  onClick={() => reassignOwner(item)}
                  className="min-h-[40px] shrink-0"
                >
                  {reassigningId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("at.change")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("at.title")}</h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("awb.pending")} ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">{t("awb.noPending")}</p>
        ) : (
          pending.map((item) => <ItemCard key={item._type + item.id} item={item} showActions />)
        )}
      </div>

      {others.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("awb.resolved")} ({others.length})</h2>
          {others.map((item) => <ItemCard key={item._type + item.id} item={item} showActions={false} />)}
        </div>
      )}
    </div>
  );
}
