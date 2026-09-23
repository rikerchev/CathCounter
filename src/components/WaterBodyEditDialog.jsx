import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Navigation, Upload, X, Image as ImageIcon } from "lucide-react";
import { COUNTRY_GROUPS } from "@/lib/countries";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

// v3.55 — same logo-size options TraderVenues.jsx already offers for a
// commercial venue's own logo (see its own LOGO_SIZE_KEYS comment for the
// full reasoning): meaningful here for exactly the same reason — a water
// body's logo can also end up snapshotted into an ad banner
// (CustomAds.jsx's "Търговци в банера"), and without a size to constrain
// it, a large source image forced the whole banner row to grow tall to fit
// it (AdBannerItem.jsx's "auto" size class is otherwise unconstrained up to
// max-h-24/max-w-full). Has no effect on the small, fixed-size logo
// thumbnails this dialog/WaterBodyManagement.jsx already show in their own
// lists — those stay a plain fixed size regardless.
const LOGO_SIZE_KEYS = [
  { value: "16x16", label: "16×16" },
  { value: "32x16", label: "32×16" },
  { value: "48x16", label: "48×16" },
  { value: "auto", labelKey: "adv.sizeAuto" },
];

const EMPTY = {
  name: "", owner_name: "", contact_phone: "", contact_email: "", website: "",
  location: "", country: "", latitude: "", longitude: "", usage_conditions: "",
  fish_population: "", max_depth: "", capacity: "", fee_per_person: "", logo_url: "", logo_size: "auto", region: "",
  working_hours: "",
};

export default function WaterBodyEditDialog({ wb, open, onOpenChange, onSaved }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  // v3.50 — logo upload (was a plain "paste a URL" field), same pipeline
  // TraderVenues.jsx already uses for a merchant venue's own logo (see its
  // v3.23 comment): base44.integrations.Core.UploadFile, storing the
  // returned file_url in `logo_url` exactly as before — just no longer
  // hand-typed/hosted by the water body owner themselves.
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (wb) {
      setForm({
        name: wb.name || "",
        owner_name: wb.owner_name || "",
        contact_phone: wb.contact_phone || "",
        contact_email: wb.contact_email || "",
        website: wb.website || "",
        location: wb.location || "",
        country: wb.country || "",
        latitude: wb.latitude != null ? String(wb.latitude) : "",
        longitude: wb.longitude != null ? String(wb.longitude) : "",
        region: wb.region || "",
        usage_conditions: wb.usage_conditions || "",
        fish_population: wb.fish_population || "",
        max_depth: wb.max_depth != null ? String(wb.max_depth) : "",
        capacity: wb.capacity || "",
        fee_per_person: wb.fee_per_person != null ? String(wb.fee_per_person) : "",
        logo_url: wb.logo_url || "",
        logo_size: wb.logo_size || "auto",
        working_hours: wb.working_hours || "",
      });
    }
  }, [wb]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function detectLocation() {
    setLocating(true);
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      set("latitude", String(lat));
      set("longitude", String(lon));

      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=${lang === "bg" ? "bg" : "en"}`);
      const data = await res.json();
      const addr = data.address || {};
      const countryCode = addr.country_code ? addr.country_code.toUpperCase() : "";
      const regionName = addr.state || addr.region || addr.county || addr.city || addr.town || addr.village || "";

      if (countryCode) set("country", countryCode);
      if (regionName) set("region", regionName);
      if (!form.location && data.display_name) set("location", data.display_name);
    } catch (e) {
      alert(t("wbd.errorLocation"));
    } finally {
      setLocating(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form.country) { alert(t("wbd.selectCountry")); return; }
    if (!form.region.trim()) { alert(t("wbd.enterRegion")); return; }
    setSaving(true);
    try {
      await onSaved({
        name: form.name,
        owner_name: form.owner_name,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email,
        website: form.website,
        location: form.location,
        country: form.country || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        region: form.region || null,
        usage_conditions: form.usage_conditions,
        fish_population: form.fish_population,
        max_depth: form.max_depth ? Number(form.max_depth) : null,
        capacity: form.capacity,
        fee_per_person: form.fee_per_person ? Number(form.fee_per_person) : 0,
        logo_url: form.logo_url || null,
        logo_size: form.logo_size || "auto",
        working_hours: form.working_hours || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("wbd.editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("wbd.name")} *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required className="min-h-[44px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbd.owner")}</Label>
              <Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbd.phone")}</Label>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.email")}</Label>
            <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.website")}</Label>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.location")} *</Label>
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} required className="min-h-[44px]" />
          </div>
          <div className="rounded-lg bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/20 dark:border-cyan-800 p-2.5">
            <Button type="button" variant="outline" onClick={detectLocation} disabled={locating} className="w-full min-h-[44px] text-xs gap-1.5">
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
              {locating ? t("wbd.detecting") : t("wbd.detectFromGps")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbd.country")} *</Label>
              <select
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                required
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
            <div className="space-y-1.5">
              <Label>{t("wbd.region")} *</Label>
              <Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder={t("wbd.regionPlaceholder")} required className="min-h-[44px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbd.latitude")}</Label>
              <Input type="number" step="any" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbd.longitude")}</Label>
              <Input type="number" step="any" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.usageConditions")}</Label>
            <Textarea value={form.usage_conditions} onChange={(e) => set("usage_conditions", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.fishPopulation")}</Label>
            <Textarea value={form.fish_population} onChange={(e) => set("fish_population", e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbd.maxDepth")}</Label>
              <Input type="number" step="any" value={form.max_depth} onChange={(e) => set("max_depth", e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbd.capacity")}</Label>
              <Input value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbd.feePerPerson")}</Label>
              <Input type="number" step="any" value={form.fee_per_person} onChange={(e) => set("fee_per_person", e.target.value)} className="min-h-[44px]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.logoUrl")}</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                {form.logo_url ? (
                  <img src={form.logo_url} alt={t("ca.logoAlt")} className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-300" />
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
                      set("logo_url", file_url);
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
                  onClick={() => set("logo_url", "")}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                  title={t("ca.removeLogo")}
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              )}
            </div>
          </div>
          {/* v3.55 — same logo-size picker TraderVenues.jsx offers for a
              commercial venue's own logo; see the LOGO_SIZE_KEYS comment above. */}
          <div className="space-y-1.5">
            <Label>{t("adv.logoSize")}</Label>
            <Select value={form.logo_size} onValueChange={(v) => set("logo_size", v)}>
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
              onChange={(e) => set("working_hours", e.target.value)}
              placeholder={t("common.workingHoursPlaceholder")}
              className="min-h-[44px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">{t("wbd.cancel")}</Button>
            <Button type="submit" disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} {t("wbd.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}