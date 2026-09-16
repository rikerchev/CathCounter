import React, { useCallback, useEffect, useState } from "react";
import { Store, Download, Loader2, Power, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import { hasRole } from "@/lib/roles";

/**
 * TraderVenues — "Одобрени търговци" → "Търговски обекти" (v2.69, reworked
 * v2.77, admin bypass restored v2.78). Editing screen for the signed-in
 * merchant's OWN commercial venues — creating a new one happens through the
 * shared MerchantRequest.jsx form (Водоем/Търговски обект type picker) and
 * goes to admin approval, same as water bodies. Approve/reject, bonus
 * ad-time and reassigning the owner still live only in AdminTraders.jsx, but
 * an admin account also sees and can edit EVERY merchant's venues here, not
 * just their own — same reasoning as WaterBodyManagement.jsx.
 */
export default function TraderVenues() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole(user, "admin");

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { name: "", address: "", contact_phone: "", contact_email: "", website: "", logo_url: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingVenue, setEditingVenue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await base44.entities.Venue.list("-created_date", 200);
      setVenues(isAdmin ? (all || []) : (all || []).filter((v) => v.created_by_id === user.id));
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast, t, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  function openEditForm(v) {
    setEditingVenue(v);
    setForm({
      name: v.name || "",
      address: v.address || "",
      contact_phone: v.contact_phone || "",
      contact_email: v.contact_email || "",
      website: v.website || "",
      logo_url: v.logo_url || "",
    });
    setShowForm(true);
  }

  // v2.77 — edit only; a brand new venue is created via MerchantRequest.jsx
  // and goes to admin approval instead.
  async function saveVenue(e) {
    e.preventDefault();
    if (!editingVenue) return;
    setSaving(true);
    const payload = {
      name: form.name,
      address: form.address,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
      website: form.website,
      logo_url: form.logo_url,
    };
    try {
      await base44.entities.Venue.update(editingVenue.id, payload);
      toast({ title: t("tv.updated") });
      setShowForm(false);
      setEditingVenue(null);
      setForm(emptyForm);
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
      <div className="flex items-center gap-2">
        <Store className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("nav.traderVenues")}</h1>
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
                  <div className="flex flex-wrap gap-1 mt-1">
                    {v.status === "pending" && (
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t("awb.pending")}
                      </span>
                    )}
                    {v.status === "rejected" && (
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {t("awb.statusRejected")}
                      </span>
                    )}
                    {!v.is_active && (
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-accent dark:text-muted-foreground">
                        {t("tv.inactive")}
                      </span>
                    )}
                  </div>
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
                  <Button size="sm" variant="outline" onClick={() => openEditForm(v)} className="min-h-[40px]">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(v)} className="min-h-[40px]">
                    <Power className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingVenue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tv.editVenue")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveVenue} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("tv.name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.address")}</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="min-h-[44px]" />
            </div>
            {/* v2.71 — these four are shown publicly on the "Търговски обекти"
                browse page (src/pages/CommercialVenues.jsx), never on the
                brochure/QR itself — all optional, blank = not shown there. */}
            <div className="space-y-1.5">
              <Label>{t("tv.phone")}</Label>
              <Input type="tel" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.email")}</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.website")}</Label>
              <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.logo")}</Label>
              <Input value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} placeholder="https://" className="min-h-[44px]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="min-h-[44px]">{t("wb.cancel")}</Button>
              <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
