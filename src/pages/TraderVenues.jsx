import React, { useCallback, useEffect, useState } from "react";
import { Store, Download, Loader2, Power, Pencil, Trash2, Upload, X, Image as ImageIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
// v3.61 — same country list WaterBodyEditDialog.jsx already uses; see its
// own comment for why this venue-side one stays optional instead of
// required. Powers the new Country filter on CommercialVenues.jsx.
import { COUNTRY_GROUPS } from "@/lib/countries";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { getMerchantBrochureLink } from "@/lib/referral";
import { downloadInviteBrochure } from "@/lib/brochure";
import { hasRole } from "@/lib/roles";
import BrochureContactDialog from "@/components/BrochureContactDialog";
import MerchantRegistrationsDialog from "@/components/MerchantRegistrationsDialog";

// v3.26 — same logo-size options CustomAds.jsx offers for an advertiser's
// own logo (16×16 / 32×16 / 48×16 / auto). Meaningful here because a
// venue's logo can now also appear inside an actual ad banner — an admin
// can attach one or more approved merchants to a custom-ads banner (see
// CustomAds.jsx's "Търговци в банера" section) and, when that happens, the
// banner renders THIS venue's own name + logo instead of hand-typed ad
// content — so the venue owner needs the same size control an advertiser
// already has, not a fixed one-size-fits-all thumbnail. Has no effect on
// the small, fixed-size logo thumbnails this page and CommercialVenues.jsx
// already show in their own lists — those stay a plain 48×48 regardless.
const LOGO_SIZE_KEYS = [
  { value: "16x16", label: "16×16" },
  { value: "32x16", label: "32×16" },
  { value: "48x16", label: "48×16" },
  { value: "auto", labelKey: "adv.sizeAuto" },
];

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
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // v3.44 — ad_description/ad_link: only ever shown if/when an admin
  // attaches this venue to a "Реклами на партньори" banner (see
  // CustomAds.jsx's "Търговци в банера" section) — this venue's own `name`
  // already serves as that banner's title.
  const emptyForm = {
    name: "", address: "", contact_phone: "", contact_email: "", website: "", logo_url: "", logo_size: "auto",
    country: "", working_hours: "", ad_description: "", ad_link: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editingVenue, setEditingVenue] = useState(null);
  const [saving, setSaving] = useState(false);
  // v3.23 — logo upload (was a plain "paste a URL" field) now goes through
  // the same object-storage upload used for advertiser logos in
  // CustomAds.jsx (base44.integrations.Core.UploadFile) — see the logo
  // field below. `logo_url` keeps storing a URL either way, just one the
  // merchant no longer has to type/host themselves.
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");
  // v3.54 — "Изтрий" (permanent delete), separate from the existing
  // toggleActive (Power icon) below, which only ever flips is_active —
  // a merchant that's simply closed/paused stayed toggleActive-able, but
  // there was previously no way to actually remove one that was created by
  // mistake, is a duplicate, or the owner genuinely wants gone. See
  // deleteVenue() below.
  const [deletingVenueId, setDeletingVenueId] = useState("");
  // v3.21 — the venue pending a brochure download, while
  // BrochureContactDialog is open asking for an optional contact line.
  const [brochureTarget, setBrochureTarget] = useState(null);
  // v3.51 — the venue whose QR/brochure registrations list is open.
  const [registrationsTarget, setRegistrationsTarget] = useState(null);
  // v3.53 — { [venueId]: count } for the "Регистрации (N)" badge on each
  // card's button (see the batch fetch effect below and
  // MerchantRegistrationsDialog's onLoaded prop). Missing an entry just
  // means "not resolved yet" — the button then shows the plain label with
  // no count, same as before this feature existed.
  const [registrationCounts, setRegistrationCounts] = useState({});

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

  // v3.53 — one batch call for every visible venue's registration count,
  // instead of one /stats round trip per row (see base44.merchantReferrals
  // .counts and server/routes/merchantReferrals.ts's own comment on that
  // route). Best-effort: a failure here must never block the venues list
  // itself from rendering — the buttons just show without a count.
  useEffect(() => {
    if (venues.length === 0) return;
    base44.merchantReferrals
      .counts(venues.map((v) => ({ type: "venue", id: v.id })))
      .then((data) => {
        const byId = {};
        for (const [key, count] of Object.entries(data || {})) {
          const i = key.indexOf(":");
          byId[key.slice(i + 1)] = count;
        }
        setRegistrationCounts(byId);
      })
      .catch(() => {});
  }, [venues]);

  function openEditForm(v) {
    setEditingVenue(v);
    setForm({
      name: v.name || "",
      address: v.address || "",
      contact_phone: v.contact_phone || "",
      contact_email: v.contact_email || "",
      website: v.website || "",
      logo_url: v.logo_url || "",
      logo_size: v.logo_size || "auto",
      country: v.country || "",
      working_hours: v.working_hours || "",
      ad_description: v.ad_description || "",
      ad_link: v.ad_link || "",
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
      logo_size: form.logo_size,
      country: form.country || null,
      working_hours: form.working_hours,
      ad_description: form.ad_description,
      ad_link: form.ad_link,
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

  // v3.54 — permanent delete, gated by the same window.confirm() pattern
  // WaterBodyManagement.jsx's deleteClosedCompetition() already uses for
  // its own irreversible action. The server side (DELETE
  // /api/entities/Venue/:id, see server/routes/entities.ts + the "owner"
  // delete rule on the Venue entity in entities.generated.ts) already
  // allowed this — owner or admin — it just had no button in this UI
  // before now. Deleting a venue does NOT cascade to anything: past
  // competitions/sector reservations don't reference venues at all (only
  // water bodies), and merchant_referrals rows earned through this venue's
  // QR/brochure code simply stay in the database, orphaned but harmless —
  // just no longer reachable through a "Регистрации" button once the venue
  // itself is gone. If this venue is currently attached to a banner ad
  // (CustomAds.jsx's "Търговци в банера"), that ad keeps showing its
  // last-known snapshot (name/logo at attach time) — removing it from the
  // ad is a separate, manual step in CustomAds.jsx.
  async function deleteVenue(v) {
    if (!window.confirm(t("tv.confirmDeleteVenue"))) return;
    setDeletingVenueId(v.id);
    try {
      await base44.entities.Venue.delete(v.id);
      toast({ title: t("tv.venueDeleted") });
      await load();
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setDeletingVenueId("");
    }
  }

  // v3.21 — now takes the free-text contact line collected by
  // BrochureContactDialog (may be empty — entirely optional).
  // v3.22 — plus `format` (PDF/JPG/PNG); `filename` dropped its extension,
  // downloadInviteBrochure appends the right one for `format`.
  async function handleDownload(v, contactText, format) {
    setDownloadingId(v.id);
    try {
      await downloadInviteBrochure({
        name: v.name,
        link: getMerchantBrochureLink("venue", v.id),
        filename: `catchcount-broshura-${(v.name || "obekt").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}`,
        contactText,
        format,
      });
      setBrochureTarget(null);
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
                <div className="flex items-start gap-3 min-w-0">
                  {/* v3.24 — same logo thumbnail CommercialVenues.jsx shows publicly,
                      so the merchant sees it right on their own card list too,
                      not only inside the edit dialog while changing it. */}
                  {v.logo_url ? (
                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-card border border-slate-100 dark:border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                      <img src={v.logo_url} alt={v.name} className="w-full h-full object-contain p-1" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-accent flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    </div>
                  )}
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
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBrochureTarget(v)}
                    disabled={downloadingId === v.id}
                    className="min-h-[40px]"
                  >
                    {downloadingId === v.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                    {t("tv.downloadBrochure")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRegistrationsTarget(v)} className="min-h-[40px]">
                    <Users className="w-4 h-4 mr-1" />
                    {t("mr.registrations")}
                    {Number.isFinite(registrationCounts[v.id]) && (
                      <span className="ml-1 text-slate-400">({registrationCounts[v.id]})</span>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditForm(v)} className="min-h-[40px]">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(v)} className="min-h-[40px]">
                    <Power className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteVenue(v)}
                    disabled={deletingVenueId === v.id}
                    className="min-h-[40px] text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 dark:text-red-400 dark:border-red-900/40"
                  >
                    {deletingVenueId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
            <div className="space-y-1.5">
              <Label>{t("wbd.country")}</Label>
              <select
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-card dark:text-foreground"
              >
                <option value="">{t("wbd.select")}</option>
                {COUNTRY_GROUPS.map((group) => (
                  <optgroup key={group.language} label={group.label}>
                    {group.countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
            {/* v3.44 — used only when an admin later attaches this venue
                to a partner-merchant ad banner (CustomAds.jsx) — the
                banner's title comes from `name` above; these two fill in
                the rest of what a manually-entered ad would otherwise need. */}
            <div className="space-y-1.5">
              <Label>{t("mr.adDescription")}</Label>
              <Textarea value={form.ad_description} onChange={(e) => setForm((f) => ({ ...f, ad_description: e.target.value }))} rows={2} placeholder={t("mr.adDescriptionPlaceholder")} />
              <p className="text-xs text-slate-400">{t("mr.adDescriptionHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("mr.adLink")}</Label>
              <Input value={form.ad_link} onChange={(e) => setForm((f) => ({ ...f, ad_link: e.target.value }))} placeholder={t("ca.linkPlaceholder")} className="min-h-[44px]" />
              <p className="text-xs text-slate-400">{t("mr.adLinkHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tv.logo")}</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt={t("ca.logoAlt")} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Upload className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <label className="flex-1 cursor-pointer">
                  <span className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full rounded-md border border-input bg-transparent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                    {uploadingLogo ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t("adv.uploading")}</>
                    ) : (
                      <><Upload className="w-4 h-4" /> {form.logo_url ? t("ca.changeLogo") : t("adv.uploadLogo")}</>
                    )}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLogo(true);
                      try {
                        const { file_url } = await base44.integrations.Core.UploadFile({ file });
                        setForm((prev) => ({ ...prev, logo_url: file_url }));
                        toast({ title: t("adv.logoUploaded") });
                      } catch (err) {
                        toast({ title: t("adv.uploadError"), description: err.message });
                      } finally {
                        setUploadingLogo(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {form.logo_url && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, logo_url: "" }))}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                    title={t("ca.removeLogo")}
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                )}
              </div>
            </div>
            {/* v3.26 — same logo-size picker CustomAds.jsx offers for an
                advertiser's own logo; see the LOGO_SIZE_KEYS comment above. */}
            <div className="space-y-1.5">
              <Label>{t("adv.logoSize")}</Label>
              <Select value={form.logo_size} onValueChange={(v) => setForm((f) => ({ ...f, logo_size: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOGO_SIZES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.workingHours")}</Label>
              <Input
                value={form.working_hours}
                onChange={(e) => setForm((f) => ({ ...f, working_hours: e.target.value }))}
                placeholder={t("common.workingHoursPlaceholder")}
                className="min-h-[44px]"
              />
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

      <BrochureContactDialog
        open={!!brochureTarget}
        onOpenChange={(open) => { if (!open) setBrochureTarget(null); }}
        defaultValue={brochureTarget?.contact_phone || ""}
        downloading={!!brochureTarget && downloadingId === brochureTarget.id}
        onConfirm={(text, format) => handleDownload(brochureTarget, text, format)}
      />

      <MerchantRegistrationsDialog
        merchantType="venue"
        merchantId={registrationsTarget?.id}
        merchantName={registrationsTarget?.name}
        open={!!registrationsTarget}
        onOpenChange={(open) => { if (!open) setRegistrationsTarget(null); }}
        onLoaded={(count) => {
          if (registrationsTarget) {
            setRegistrationCounts((prev) => ({ ...prev, [registrationsTarget.id]: count }));
          }
        }}
      />
    </div>
  );
}
