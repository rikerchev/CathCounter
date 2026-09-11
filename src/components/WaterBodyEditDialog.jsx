import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Navigation } from "lucide-react";
import { COUNTRY_GROUPS } from "@/lib/countries";
import { useLanguage } from "@/lib/i18n";

const EMPTY = {
  name: "", owner_name: "", contact_phone: "", contact_email: "",
  location: "", country: "", latitude: "", longitude: "", usage_conditions: "",
  fish_population: "", max_depth: "", capacity: "", fee_per_person: "", logo_url: "", iban: "", region: "",
};

export default function WaterBodyEditDialog({ wb, open, onOpenChange, onSaved }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (wb) {
      setForm({
        name: wb.name || "",
        owner_name: wb.owner_name || "",
        contact_phone: wb.contact_phone || "",
        contact_email: wb.contact_email || "",
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
        iban: wb.iban || "",
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
        iban: form.iban || null,
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
            <Label>{t("wbd.iban")} *</Label>
            <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="BG12STSA12345678901234" className="min-h-[44px] font-mono text-sm" />
            <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              {t("wbd.ibanInfo")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.logoUrl")}</Label>
            <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} className="min-h-[44px]" />
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