import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Fish, Megaphone, Users, Smartphone, Eye, CheckCircle2, Upload, Loader2, X, Ban, ShoppingBag, Tent, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { COUNTRY_GROUPS, COUNTRY_NAME_BY_CODE, ALL_COUNTRIES } from "@/lib/countries";
import { calculateCountryPrice, calculateTotalPrice } from "@/lib/pricing";
import PaymentInfoCard from "@/components/PaymentInfoCard";

const ALL_COUNTRY_CODES = ALL_COUNTRIES.map((c) => c.code);

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

const BG_OPTION_KEYS = [
  { value: "bg-gradient-to-r from-cyan-600 to-blue-600", labelKey: "adv.colorBlue" },
  { value: "bg-gradient-to-r from-emerald-600 to-teal-600", labelKey: "adv.colorGreen" },
  { value: "bg-gradient-to-r from-amber-500 to-orange-600", labelKey: "adv.colorOrange" },
  { value: "bg-gradient-to-r from-purple-600 to-pink-600", labelKey: "adv.colorPurple" },
  { value: "bg-gradient-to-r from-slate-800 to-slate-900", labelKey: "adv.colorDark" },
  { value: "bg-gradient-to-r from-rose-500 to-red-600", labelKey: "adv.colorRed" },
  { value: "bg-black", labelKey: "adv.colorBlack" },
];

const LOGO_SIZE_KEYS = [
  { value: "16x16", label: "16×16" },
  { value: "32x16", label: "32×16" },
  { value: "48x16", label: "48×16" },
  { value: "auto", labelKey: "adv.sizeAuto" },
];

const emptyForm = {
  ad_slot_id: "",
  ad_title: "",
  ad_description: "",
  website_url: "",
  logo_url: "",
  logo_size: "auto",
  bg_class: "bg-gradient-to-r from-cyan-600 to-blue-600",
  text_class: "text-white",
  months: 1,
  additional_info: "",
};

// Get the auto-calculated price for a specific country code from the base price
function getCountryPrice(basePrice, countryCode) {
  return calculateCountryPrice(basePrice || 0, countryCode);
}

export default function Advertise() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const PLACEMENT_LABELS = {};
  for (const k in PLACEMENT_KEYS) PLACEMENT_LABELS[k] = t(PLACEMENT_KEYS[k]);
  const BG_OPTIONS = BG_OPTION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));
  const [slots, setSlots] = useState([]);
  const [totalSlotCount, setTotalSlotCount] = useState(null); // how many AdSlot rows exist at all, regardless of availability — lets the UI tell "none configured yet" apart from "all currently rented"
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [targetAllCountries, setTargetAllCountries] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [countryContent, setCountryContent] = useState({});

  useEffect(() => { loadSlots(); }, []);

  async function loadSlots() {
    try {
      const [slotData, adData] = await Promise.all([
        base44.entities.AdSlot.list(),
        base44.entities.CustomAd.list(),
      ]);
      setTotalSlotCount((slotData || []).length);
      // is_available is the admin's explicit "hide this from advertisers"
      // switch (the eye/eye-off toggle in "Управление на рекламни места") —
      // it used to be silently ignored here, so a slot the admin had hidden
      // could still be requested. Also drop anything already marked
      // "rented" outright (belt-and-braces alongside the CustomAd check
      // below, which is what actually reflects reality moment to moment).
      const explicitlyOpen = (slotData || []).filter((s) => s.is_available !== false && s.status !== "rented");
      // A placement/slot is only truly full when a currently active,
      // already-approved ad covers ALL languages there (`languages` unset or
      // "all"). An ad restricted to just one or two languages (e.g. only
      // "bg") still leaves that same placement free for a different
      // advertiser in the other languages, so it must not hide the slot
      // here — previously ANY ad at all for a placement (even a
      // single-language one, even one still pending review) hid it
      // entirely, which meant a placement could never be requested again
      // once even one language of it was taken.
      const fullyOccupied = (a) => a.is_active && a.status !== "pending_review" && (!a.languages || a.languages === "all");
      const rentedSlotIds = new Set((adData || []).filter(fullyOccupied).map((a) => a.ad_slot_id).filter(Boolean));
      const rentedPlacements = new Set((adData || []).filter(fullyOccupied).map((a) => a.placement).filter(Boolean));
      const available = explicitlyOpen.filter(
        (s) => !rentedSlotIds.has(s.id) && !rentedPlacements.has(s.placement)
      );
      setSlots(available);
    } catch (e) {
      // Surfaced now instead of swallowed — a load failure used to look
      // identical to "no banners available", which made a real error
      // (network/permissions) indistinguishable from normal "all rented".
      toast({ title: t("adv.loadError"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const selectedSlot = slots.find((s) => s.id === form.ad_slot_id);
  const basePrice = selectedSlot?.price_per_month || 0;
  const isMultiCountry = targetAllCountries || selectedCountries.length > 1;

  // English (main title/description) is mandatory unless at least one
  // selected country has its own title or description override.
  const hasCountryContent = selectedCountries.some((code) => {
    const c = countryContent[code];
    return c?.title?.trim() || c?.description?.trim();
  });
  const englishMandatory = !isMultiCountry || !hasCountryContent;

  // Calculate total from auto-calculated country prices
  const totalPrice = (() => {
    if (targetAllCountries) {
      // All countries — sum all available countries
      return calculateTotalPrice(basePrice, ALL_COUNTRY_CODES, form.months).toFixed(2);
    }
    return calculateTotalPrice(basePrice, selectedCountries, form.months).toFixed(2);
  })();

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  async function submitRequest() {
    if (!user?.email) {
      toast({ title: t("adv.loginRequired"), variant: "destructive" });
      return;
    }
    if (!form.ad_slot_id) {
      toast({ title: t("adv.selectBannerReq"), variant: "destructive" });
      return;
    }
    if (!form.website_url) {
      toast({ title: t("adv.enterLink"), variant: "destructive" });
      return;
    }
    if (englishMandatory && (!form.ad_title || !form.ad_description)) {
      toast({
        title: isMultiCountry
          ? t("adv.fillEnTitleOrTranslation")
          : t("adv.fillTitleDesc"),
        variant: "destructive",
      });
      return;
    }
    if (!targetAllCountries && selectedCountries.length === 0) {
      toast({ title: t("adv.selectCountry"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const total = parseFloat(totalPrice);
      const countries = targetAllCountries ? "all" : selectedCountries.join(",");
      const allCodes = targetAllCountries ? ALL_COUNTRY_CODES : selectedCountries;
      const cpData = Object.fromEntries(
        allCodes.map((c) => [c, calculateCountryPrice(basePrice, c)])
      );
      const countryPricingStr = JSON.stringify(cpData);
      await base44.entities.AdSlotRequest.create({
        ad_slot_id: selectedSlot.id,
        ad_slot_name: selectedSlot.name,
        placement: selectedSlot.placement,
        advertiser_email: user.email,
        advertiser_name: user.full_name || "",
        website_url: form.website_url,
        logo_url: form.logo_url || "",
        months: Number(form.months),
        additional_info: form.additional_info || "",
        price_per_month: basePrice,
        total_price: total,
        countries,
        country_pricing: countryPricingStr,
        ad_title: form.ad_title,
        ad_description: form.ad_description,
        ad_bg_class: form.bg_class,
        ad_text_class: form.text_class,
        ad_logo_size: form.logo_size,
        country_content: JSON.stringify(countryContent),
        status: "pending",
      });
      toast({ title: t("adv.requestSent"), description: t("adv.requestSentDesc") });
      setForm(emptyForm);
      setSelectedCountries([]);
      setCountryContent({});
      setTargetAllCountries(false);
      await loadSlots();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <Fish className="w-6 h-6" />
          <h1 className="text-xl font-bold">{t("advertise.title")}</h1>
        </div>
        <p className="text-cyan-100 text-sm">{t("advertise.subtitle")}</p>
      </div>

      {/* Form */}
      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wide">{t("adv.bannerRequest")}</h2>
        </div>

        {/* Slot selector */}
        <div>
          <Label>{t("adv.showOn")} *</Label>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">
              {totalSlotCount === 0 ? t("adv.noSlotsConfigured") : t("adv.noSlots")}
            </p>
          ) : (
            <Select value={form.ad_slot_id} onValueChange={(v) => setForm({ ...form, ad_slot_id: v })}>
              <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={t("adv.selectBanner")} /></SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.id}>
                    {slot.name} — {PLACEMENT_LABELS[slot.placement] || slot.placement} (€{slot.price_per_month}/мес)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Title */}
        <div>
          <Label>{isMultiCountry ? `${t("adv.titleEn")}${englishMandatory ? " *" : ""}` : `${t("adv.titleReq")}`}</Label>
          <Input value={form.ad_title} onChange={(e) => setForm({ ...form, ad_title: e.target.value })} placeholder={t("adv.titlePlaceholder")} className="min-h-[44px]" />
        </div>

        {/* Description */}
        <div>
          <Label>{isMultiCountry ? `${t("adv.descriptionEn")}${englishMandatory ? " *" : ""}` : `${t("adv.descriptionReq")}`}</Label>
          <Input value={form.ad_description} onChange={(e) => setForm({ ...form, ad_description: e.target.value })} placeholder={t("adv.descriptionPlaceholder")} className="min-h-[44px]" />
        </div>

        {/* Link */}
        <div>
          <Label>{t("adv.linkReq")}</Label>
          <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://example.com" className="min-h-[44px]" />
        </div>

        {/* Logo */}
        <div>
          <Label>{t("adv.logo")}</Label>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
              {form.logo_url ? <img src={form.logo_url} alt={t("adv.logo")} className="w-full h-full object-contain p-1" /> : <Upload className="w-5 h-5 text-slate-300" />}
            </div>
            <label className="flex-1 cursor-pointer">
              <span className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full rounded-md border border-input bg-transparent text-sm font-medium hover:bg-accent transition-colors">
                {uploadingLogo ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("adv.uploading")}</> : <><Upload className="w-4 h-4" /> {t("adv.uploadLogo")}</>}
              </span>
              <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={async (e) => {
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
              }} />
            </label>
            {form.logo_url && (
              <button type="button" onClick={() => setForm({ ...form, logo_url: "" })} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {/* Logo size + BG color */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("adv.logoSize")}</Label>
            <Select value={form.logo_size} onValueChange={(v) => setForm({ ...form, logo_size: v })}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOGO_SIZES.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("adv.color")}</Label>
            <Select value={form.bg_class} onValueChange={(v) => setForm({ ...form, bg_class: v })}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BG_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Country targeting */}
        {selectedSlot && (
          <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-600" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.targetCountries")}</h3>
            </div>

            {/* All countries toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={targetAllCountries}
                onChange={(e) => setTargetAllCountries(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-600"
              />
              <span className="text-sm text-slate-600 dark:text-muted-foreground">{t("adv.allCountries")}</span>
              {targetAllCountries && (
                <span className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                  · €{calculateTotalPrice(basePrice, ALL_COUNTRY_CODES, 1).toFixed(2)}/мес
                </span>
              )}
            </label>

            {targetAllCountries ? (
              <p className="text-xs text-slate-400">
                 {t("adv.allCountriesDesc").replace("{price}", calculateTotalPrice(basePrice, ALL_COUNTRY_CODES, 1).toFixed(2))}
               </p>
              ) : (
               <>
                 <p className="text-xs text-slate-400">{t("adv.pricingDesc")}</p>
                <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                  {COUNTRY_GROUPS.map((group) => (
                    <div key={group.language}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{group.label}</p>
                      <div className="space-y-1">
                        {group.countries.map((country) => {
                          const checked = selectedCountries.includes(country.code);
                          const price = getCountryPrice(basePrice, country.code);
                          return (
                            <label key={country.code} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCountry(country.code)}
                                className="w-4 h-4 rounded accent-cyan-600"
                              />
                              <span className="text-sm text-slate-600 dark:text-muted-foreground flex-1 min-w-0 truncate">{country.name}</span>
                              <span className="text-xs font-medium text-cyan-700 dark:text-cyan-400 whitespace-nowrap">€{price.toFixed(2)}/мес</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Per-country title/description overrides */}
        {!targetAllCountries && selectedCountries.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-600" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.countryContent")}</h3>
              </div>
              <p className="text-xs text-slate-400">{t("adv.countryContentDesc")}</p>
            {selectedCountries.map((code) => {
              const countryName = COUNTRY_NAME_BY_CODE[code] || code;
              const content = countryContent[code] || { title: "", description: "" };
              return (
                <div key={code} className="space-y-2 pb-3 border-b border-slate-100 dark:border-border last:border-0 last:pb-0">
                  <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">{countryName}</p>
                  <Input
                    value={content.title}
                    onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, title: e.target.value } }))}
                    placeholder={t("adv.titleForCountry")}
                    className="min-h-[44px]"
                  />
                  <Input
                    value={content.description}
                    onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, description: e.target.value } }))}
                    placeholder={t("adv.descriptionForCountry")}
                    className="min-h-[44px]"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Months + Total */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("adv.period")}</Label>
            <Select value={String(form.months)} onValueChange={(v) => setForm({ ...form, months: Number(v) })}>
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 6, 12].map((m) => (<SelectItem key={m} value={String(m)}>{m} {t("adv.months")}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <div className="w-full p-3 rounded-xl bg-cyan-50 dark:bg-accent text-center">
              <p className="text-xs text-slate-500 dark:text-muted-foreground">{t("adv.totalAmount")}</p>
              <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400">€{totalPrice}</p>
            </div>
          </div>
        </div>

        {/* Additional info */}
        <div>
          <Label>{t("adv.additionalInfo")}</Label>
          <Textarea value={form.additional_info} onChange={(e) => setForm({ ...form, additional_info: e.target.value })} placeholder={t("adv.additionalInfoPlaceholder")} rows={3} className="min-h-[60px]" />
        </div>

        {/* Preview */}
        {form.ad_title && (
          <div>
            <Label>{t("adv.preview")}</Label>
            <div className={`rounded-xl p-3 ${form.bg_class}`}>
              <div className="flex items-center gap-2">
                {form.logo_url && <img src={form.logo_url} alt="" className="w-9 h-9 rounded object-contain bg-white/90 p-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${form.text_class} truncate`}>{form.ad_title}</p>
                  <p className={`text-xs ${form.text_class} opacity-90 truncate`}>{form.ad_description}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <Button onClick={submitRequest} disabled={submitting || !form.ad_slot_id} className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[48px]">
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
           {t("adv.submit")}
        </Button>
      </div>

      <PaymentInfoCard />

      {/* Audience */}
      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("advertise.audience")}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-accent">
            <Users className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
            <p className="text-xs text-slate-400">{t("advertise.anglers")}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-accent">
            <Smartphone className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
            <p className="text-xs text-slate-400">{t("advertise.mobileFirst")}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-accent">
            <Eye className="w-5 h-5 text-cyan-600 mx-auto mb-1" />
            <p className="text-xs text-slate-400">{t("advertise.activeUsers")}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">{t("advertise.audienceDesc")}</p>
      </div>

      {/* Content policy */}
      <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("advertise.contentPolicy")}</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-foreground">{t("advertise.recommended")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 pl-4">
            {[
              { icon: Fish, label: t("advertise.fishingGear") },
              { icon: ShoppingBag, label: t("advertise.fishingShops") },
              { icon: Tent, label: t("advertise.outdoorRecreation") },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-emerald-600" />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-foreground">{t("advertise.blocked")}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 pl-4">
            {[t("advertise.blockedDating"), t("advertise.blockedAdult"), t("advertise.blockedGambling"), t("advertise.blockedOther")].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-slate-600 dark:text-muted-foreground">
                <Ban className="w-3.5 h-3.5 text-rose-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}