import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Waves, Store, Send, MapPin, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCurrentLocation } from "@/lib/geolocation";
import { useLanguage } from "@/lib/i18n";
// v3.61 — same country list WaterBodyEditDialog.jsx already uses for water
// bodies (grouped by language, src/lib/countries.js), now also offered here
// at REGISTRATION time for both types, so a new merchant/water body can be
// filtered by country (CommercialVenues.jsx/WaterBodies.jsx) as soon as it's
// approved, without waiting for a separate admin edit to set it. Optional
// for both — unlike WaterBodyEditDialog's own required picker (an existing,
// pre-v3.61 UI decision this change doesn't touch).
import { COUNTRY_GROUPS } from "@/lib/countries";

// v3.26 — same logo-size options TraderVenues.jsx/CustomAds.jsx offer; see
// TraderVenues.jsx's own comment on why this matters (a venue's logo can
// end up inside an actual ad banner once an admin attaches it to one).
const LOGO_SIZE_KEYS = [
  { value: "16x16", label: "16×16" },
  { value: "32x16", label: "32×16" },
  { value: "48x16", label: "48×16" },
  { value: "auto", labelKey: "adv.sizeAuto" },
];

// v2.77 — replaces the old water-body-only WaterBodyRequest.jsx. Any
// registered user can submit either object type here; nothing requires
// already holding the "Търговец" (water_owner) role first — that role is
// still granted automatically, the same way as before, the moment an admin
// approves this user's first water body or venue (see AdminTraders.jsx).
// Both branches submit with status: "pending" and go into that same shared
// approval queue.
export default function MerchantRequest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState(searchParams.get("type") === "venue" ? "venue" : "water_body");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  // v3.26 — logo upload state, same pattern as TraderVenues.jsx's own
  // uploadingLogo (base44.integrations.Core.UploadFile), now available
  // already at request time instead of only after approval.
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));

  const [wbForm, setWbForm] = useState({
    name: "",
    owner_name: user?.full_name || "",
    contact_phone: "",
    contact_email: user?.email || "",
    location: "",
    country: "",
    latitude: "",
    longitude: "",
    usage_conditions: "",
    fish_population: "",
    max_depth: "",
    capacity: "",
    fee_per_person: "",
  });
  // v3.44 — ad_description/ad_link: shown only if/when an admin later
  // attaches this venue to a "Реклами на партньори" banner (see
  // CustomAds.jsx's "Търговци в банера" section) — the venue's own `name`
  // above already serves as that banner's title, so only these two are new.
  const [venueForm, setVenueForm] = useState({
    name: "", address: "", contact_phone: "", contact_email: user?.email || "", website: "", logo_url: "", logo_size: "auto",
    country: "", ad_description: "", ad_link: "",
  });

  const setWb = (key) => (e) => setWbForm((f) => ({ ...f, [key]: e.target.value }));
  const setVenue = (key) => (e) => setVenueForm((f) => ({ ...f, [key]: e.target.value }));

  async function captureLocation() {
    setLocating(true);
    try {
      const loc = await getCurrentLocation("bg");
      setWbForm((f) => ({
        ...f,
        latitude: loc.latitude ? String(loc.latitude) : f.latitude,
        longitude: loc.longitude ? String(loc.longitude) : f.longitude,
        location: loc.name || f.location,
      }));
      toast({ title: t("wbr.locationCaptured") });
    } catch (e) {
      toast({ title: t("wbr.locationError"), description: e.message, variant: "destructive" });
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type === "water_body") {
        await base44.entities.WaterBody.create({
          ...wbForm,
          country: wbForm.country || null,
          max_depth: wbForm.max_depth ? Number(wbForm.max_depth) : null,
          capacity: wbForm.capacity || null,
          fee_per_person: wbForm.fee_per_person ? Number(wbForm.fee_per_person) : 0,
          latitude: wbForm.latitude ? Number(wbForm.latitude) : null,
          longitude: wbForm.longitude ? Number(wbForm.longitude) : null,
          status: "pending",
        });
      } else {
        await base44.entities.Venue.create({
          ...venueForm,
          country: venueForm.country || null,
          status: "pending",
          is_active: true,
        });
      }
      toast({ title: t("wbr.requestSent"), description: t("wbr.requestSentDesc") });
      navigate(type === "water_body" ? "/water-bodies" : "/commercial-venues");
    } catch (err) {
      toast({ title: t("wbr.sendError"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Waves className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("mr.title")}</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("mr.description")}</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType("water_body")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium min-h-[48px] transition-colors ${
            type === "water_body" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-accent dark:text-muted-foreground"
          }`}
        >
          <Waves className="w-4 h-4" /> {t("mr.typeWaterBody")}
        </button>
        <button
          type="button"
          onClick={() => setType("venue")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium min-h-[48px] transition-colors ${
            type === "venue" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-accent dark:text-muted-foreground"
          }`}
        >
          <Store className="w-4 h-4" /> {t("mr.typeVenue")}
        </button>
      </div>

      {type === "water_body" ? (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label>{t("wbr.name")} *</Label>
            <Input value={wbForm.name} onChange={setWb("name")} required className="min-h-[44px]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbr.ownerName")}</Label>
              <Input value={wbForm.owner_name} onChange={setWb("owner_name")} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbr.phone")} *</Label>
              <Input value={wbForm.contact_phone} onChange={setWb("contact_phone")} required className="min-h-[44px]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("wbr.email")}</Label>
            <Input type="email" value={wbForm.contact_email} onChange={setWb("contact_email")} className="min-h-[44px]" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("wbr.address")} *</Label>
            <Input value={wbForm.location} onChange={setWb("location")} required className="min-h-[44px]" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("wbd.country")}</Label>
            <select
              value={wbForm.country}
              onChange={setWb("country")}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbr.latitude")}</Label>
              <Input type="number" step="any" value={wbForm.latitude} onChange={setWb("latitude")} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbr.longitude")}</Label>
              <Input type="number" step="any" value={wbForm.longitude} onChange={setWb("longitude")} className="min-h-[44px]" />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={captureLocation} disabled={locating} className="w-full min-h-[44px]">
            <MapPin className="w-4 h-4 mr-1" /> {locating ? t("wbr.locating") : t("wbr.captureLocation")}
          </Button>

          <div className="space-y-1.5">
            <Label>{t("wbr.conditions")} *</Label>
            <Textarea value={wbForm.usage_conditions} onChange={setWb("usage_conditions")} required rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("wbr.fishPopulation")} *</Label>
            <Textarea
              value={wbForm.fish_population}
              onChange={setWb("fish_population")}
              required
              rows={3}
              placeholder={t("wbr.fishPopulationPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wbr.maxDepth")}</Label>
              <Input type="number" step="any" value={wbForm.max_depth} onChange={setWb("max_depth")} className="min-h-[44px]" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wbr.capacity")}</Label>
              <Input value={wbForm.capacity} onChange={setWb("capacity")} placeholder={t("wbr.capacityPlaceholder")} className="min-h-[44px]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("wbr.feePerPerson")}</Label>
            <Input type="number" step="any" value={wbForm.fee_per_person} onChange={setWb("fee_per_person")} placeholder={t("wbr.feePlaceholder")} className="min-h-[44px]" />
          </div>

          <Button type="submit" disabled={submitting} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[48px]">
            <Send className="w-4 h-4 mr-1" /> {submitting ? t("wbr.sending") : t("wbr.submit")}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label>{t("tv.name")} *</Label>
            <Input value={venueForm.name} onChange={setVenue("name")} required className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("tv.address")}</Label>
            <Input value={venueForm.address} onChange={setVenue("address")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("wbd.country")}</Label>
            <select
              value={venueForm.country}
              onChange={setVenue("country")}
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
            <Label>{t("tv.phone")}</Label>
            <Input type="tel" value={venueForm.contact_phone} onChange={setVenue("contact_phone")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("tv.email")}</Label>
            <Input type="email" value={venueForm.contact_email} onChange={setVenue("contact_email")} className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("tv.website")}</Label>
            <Input value={venueForm.website} onChange={setVenue("website")} placeholder="https://" className="min-h-[44px]" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("mr.adDescription")}</Label>
            <Textarea value={venueForm.ad_description} onChange={setVenue("ad_description")} rows={2} placeholder={t("mr.adDescriptionPlaceholder")} />
            <p className="text-xs text-slate-400">{t("mr.adDescriptionHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("mr.adLink")}</Label>
            <Input value={venueForm.ad_link} onChange={setVenue("ad_link")} placeholder={t("ca.linkPlaceholder")} className="min-h-[44px]" />
            <p className="text-xs text-slate-400">{t("mr.adLinkHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("tv.logo")}</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                {venueForm.logo_url ? (
                  <img src={venueForm.logo_url} alt={t("ca.logoAlt")} className="w-full h-full object-contain p-1" />
                ) : (
                  <Upload className="w-5 h-5 text-slate-300" />
                )}
              </div>
              <label className="flex-1 cursor-pointer">
                <span className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full rounded-md border border-input bg-transparent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                  {uploadingLogo ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t("adv.uploading")}</>
                  ) : (
                    <><Upload className="w-4 h-4" /> {venueForm.logo_url ? t("ca.changeLogo") : t("adv.uploadLogo")}</>
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
                      setVenueForm((prev) => ({ ...prev, logo_url: file_url }));
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
              {venueForm.logo_url && (
                <button
                  type="button"
                  onClick={() => setVenueForm((f) => ({ ...f, logo_url: "" }))}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                  title={t("ca.removeLogo")}
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("adv.logoSize")}</Label>
            <Select value={venueForm.logo_size} onValueChange={(v) => setVenueForm((f) => ({ ...f, logo_size: v }))}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOGO_SIZES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={submitting} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[48px]">
            <Send className="w-4 h-4 mr-1" /> {submitting ? t("wbr.sending") : t("wbr.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
