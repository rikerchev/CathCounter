import React, { useCallback, useEffect, useState } from "react";
import { Store, PlusCircle, Download, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";
import { base44 } from "@/api/base44Client";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import MerchantBonusEditor from "@/components/MerchantBonusEditor";

/**
 * TraderVenues — Търговци → "Търговски обекти" (v2.69). A water_owner/admin
 * creates a venue (name + optional address), gets a printable brochure with
 * a QR that identifies that venue directly, and — for admins — can set how
 * many free banner-days it earns per new registration through it (0 days /
 * no banner by default, see MerchantBonusEditor.jsx).
 */
export default function TraderVenues() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole(user, "admin");

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await base44.entities.Venue.list("-created_date", 200);
      const mine = isAdmin ? (all || []) : (all || []).filter((v) => v.created_by_id === user.id);
      setVenues(mine);
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function createVenue(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.entities.Venue.create({ name: form.name, address: form.address, is_active: true });
      toast({ title: t("tv.created") });
      setShowForm(false);
      setForm({ name: "", address: "" });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(v) {
    try {
      await base44.entities.Venue.update(v.id, { is_active: !v.is_active });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    }
  }

  async function handleDownload(v) {
    setDownloadingId(v.id);
    try {
      await downloadInviteBrochure({
        name: v.name,
        link: getMerchantBrochureLink("venue", v.id),
        filename: `catchcount-broshura-${(v.name || "obekt").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.pdf`,
      });
    } catch (e) {
      toast({ title: t("tv.brochureFailed"), description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId("");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Store className="w-6 h-6 text-cyan-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("nav.traderVenues")}</h1>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-cyan-600 hover:bg-cyan-700 min-h-[40px]">
          <PlusCircle className="w-4 h-4 mr-1" /> {t("tv.newVenue")}
        </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("tv.subtitle")}</p>

      {venues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Store className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">{t("tv.noVenues")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <div key={v.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800 dark:text-foreground truncate">{v.name}</h2>
                  {v.address && <p className="text-xs text-slate-400 truncate">{v.address}</p>}
                  {!v.is_active && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-accent dark:text-muted-foreground">
                      {t("tv.inactive")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(v)}
                    disabled={downloadingId === v.id}
                    className="min-h-[40px]"
                  >
                    {downloadingId === v.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                    {t("tv.downloadBrochure")}
                  </Button>
                  {(isAdmin || v.created_by_id === user?.id) && (
                    <Button size="sm" variant="outline" onClick={() => toggleActive(v)} className="min-h-[40px]">
                      <Power className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {isAdmin && (
                <MerchantBonusEditor merchant={v} merchantType="venue" onSaved={(patch) => setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)))} />
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tv.newVenue")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={createVenue} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("tv.name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.address")}</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="min-h-[44px]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />}
                {t("wb.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
