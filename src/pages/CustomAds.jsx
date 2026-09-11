import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { DEFAULT_LANGUAGES, getLanguageNativeName } from "@/lib/languages";
import { Plus, Trash2, Pencil, X, Eye, EyeOff, Upload, Loader2, Check, Globe, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";
import { COUNTRY_GROUPS, COUNTRY_NAME_BY_CODE } from "@/lib/countries";

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

const AD_STATUS_KEYS = {
  active: "ca.statusActive",
  pending_review: "ca.statusPendingReview",
};

const AD_STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700",
  pending_review: "bg-amber-100 text-amber-700",
};

const emptyAd = {
  title: "",
  description: "",
  link: "/",
  logo_url: "",
  logo_size: "auto",
  bg_class: "bg-gradient-to-r from-cyan-600 to-blue-600",
  text_class: "text-white",
  is_active: true,
  placement: "all",
  sort_order: 0,
  status: "active",
  countries: "all",
  country_content: "",
  language_content: "",
};

export default function CustomAdsManager() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const PLACEMENTS = Object.keys(PLACEMENT_KEYS).map((k) => ({ value: k, label: t(PLACEMENT_KEYS[k]) }));
  const BG_OPTIONS = BG_OPTION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));
  const AD_STATUS_LABELS = {};
  for (const k in AD_STATUS_KEYS) AD_STATUS_LABELS[k] = t(AD_STATUS_KEYS[k]);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyAd);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [countryContent, setCountryContent] = useState({});
  const [languageContent, setLanguageContent] = useState({});
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [targetAllCountries, setTargetAllCountries] = useState(true);

  useEffect(() => {
    loadAds();
  }, []);

  const isAdmin = hasRole(user, "admin");

  if (user && !hasRole(user, "advertiser") && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  async function loadAds() {
    try {
      const data = await base44.entities.CustomAd.list("sort_order");
      const filtered = (data || []).filter((ad) => {
        if (isAdmin) return true;
        return ad.advertiser_id === user?.id;
      });
      setAds(filtered);
    } catch (e) {
      toast({ title: t("adv.loadError"), description: e.message });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(ad) {
    setEditing(ad.id);
    const countries = ad.countries || "all";
    const isAll = countries === "all";
    const codes = isAll ? [] : countries.split(",").map((c) => c.trim()).filter(Boolean);
    let parsedContent = {};
    try {
      parsedContent = ad.country_content ? JSON.parse(ad.country_content) : {};
    } catch {
      parsedContent = {};
    }
    let parsedLangContent = {};
    try {
      parsedLangContent = ad.language_content ? JSON.parse(ad.language_content) : {};
    } catch {
      parsedLangContent = {};
    }
    setForm({
      title: ad.title || "",
      description: ad.description || "",
      link: ad.link || "/",
      logo_url: ad.logo_url || "",
      logo_size: ad.logo_size || "auto",
      bg_class: ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600",
      text_class: ad.text_class || "text-white",
      is_active: ad.is_active ?? true,
      placement: ad.placement || "all",
      sort_order: ad.sort_order || 0,
      status: ad.status || "active",
      countries,
      country_content: ad.country_content || "",
      language_content: ad.language_content || "",
    });
    setSelectedLanguages(Object.keys(parsedLangContent));
    setLanguageContent(parsedLangContent);
    // Also include countries that have per-country content overrides
    const overrideCodes = Object.keys(parsedContent);
    const allCodes = [...new Set([...codes, ...overrideCodes])];
    setTargetAllCountries(isAll);
    setSelectedCountries(allCodes);
    setCountryContent(parsedContent);
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyAd);
    setSelectedCountries([]);
    setCountryContent({});
    setLanguageContent({});
    setSelectedLanguages([]);
    setTargetAllCountries(true);
  }

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  async function save() {
    if (!form.title || !form.description || !form.link) {
      toast({ title: t("adv.fillAllFields") });
      return;
    }
    try {
      const countries = targetAllCountries ? "all" : selectedCountries.join(",");
      const payload = {
        ...form,
        countries,
        country_content: JSON.stringify(countryContent),
        language_content: JSON.stringify(languageContent),
      };
      if (editing) {
        if (!isAdmin) payload.status = "pending_review";
        await base44.entities.CustomAd.update(editing, payload);
        toast({ title: isAdmin ? t("ca.adUpdated") : t("ca.changesForReview") });
        } else {
         await base44.entities.CustomAd.create(payload);
         toast({ title: t("ca.adCreated") });
        }
        resetForm();
        await loadAds();
        } catch (e) {
        toast({ title: t("ca.saveError"), description: e.message });
    }
  }

  async function remove(id) {
    try {
      await base44.entities.CustomAd.delete(id);
      toast({ title: t("ca.adDeleted") });
       if (editing === id) resetForm();
       await loadAds();
      } catch (e) {
       toast({ title: t("ca.deleteError"), description: e.message });
    }
  }

  async function approveAd(ad) {
    try {
      await base44.entities.CustomAd.update(ad.id, { status: "active" });
      toast({ title: t("ca.changesApproved") });
       await loadAds();
      } catch (e) {
       toast({ title: t("awb.error"), description: e.message });
      }
      }

      async function toggleActive(ad) {
      try {
       await base44.entities.CustomAd.update(ad.id, { is_active: !ad.is_active });
       await loadAds();
      } catch (e) {
       toast({ title: t("awb.error"), description: e.message });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("ca.title")}</h1>
         {!editing && isAdmin && (
           <Button onClick={() => { setForm(emptyAd); }} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
             <Plus className="w-4 h-4 mr-1" /> {t("ca.new")}
          </Button>
        )}
      </div>

      {/* Form */}
      {(editing || (ads.length === 0 && isAdmin)) && (
        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">
              {editing ? t("ca.editing") : t("ca.newAd")}
            </h2>
            {editing && (
              <button onClick={resetForm} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-accent">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label>{t("ca.adTitle")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("adv.titlePlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.adDescription")}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("adv.descriptionPlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.adLink")}</Label>
              <Input
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder={t("ca.linkPlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.advertiserLogo")}</Label>
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
                    onClick={() => setForm({ ...form, logo_url: "" })}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                    title={t("ca.removeLogo")}
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label>{t("adv.logoSize")}</Label>
              <Select value={form.logo_size} onValueChange={(v) => setForm({ ...form, logo_size: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOGO_SIZES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("adv.color")}</Label>
                <Select value={form.bg_class} onValueChange={(v) => setForm({ ...form, bg_class: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BG_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("adv.showOn")}</Label>
                <Select value={form.placement} onValueChange={(v) => setForm({ ...form, placement: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label>{t("ca.active")}</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>

            {/* Country targeting */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.targetCountries")}</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={targetAllCountries}
                  onChange={(e) => setTargetAllCountries(e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-600"
                />
                <span className="text-sm text-slate-600 dark:text-muted-foreground">{t("ca.allCountries")}</span>
              </label>
              {!targetAllCountries && (
                <>
                  <p className="text-xs text-slate-400">{t("ca.countryTargetingDesc")}</p>
                  <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                    {COUNTRY_GROUPS.map((group) => (
                      <div key={group.language}>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{group.label}</p>
                        <div className="space-y-1">
                          {group.countries.map((country) => {
                            const checked = selectedCountries.includes(country.code);
                            return (
                              <label key={country.code} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCountry(country.code)}
                                  className="w-4 h-4 rounded accent-cyan-600"
                                />
                                <span className="text-sm text-slate-600 dark:text-muted-foreground flex-1 min-w-0 truncate">{country.name}</span>
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

            {/* Per-country title/description overrides — always visible */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.countryContent")}</h3>
              </div>
              <p className="text-xs text-slate-400">{t("ca.countryContentDesc")}</p>

              {/* Country picker for overrides */}
              <Select value="" onValueChange={(code) => { if (!selectedCountries.includes(code)) toggleCountry(code); }}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={t("ca.addCountryForTranslation")} /></SelectTrigger>
                <SelectContent>
                  {COUNTRY_GROUPS.map((group) => (
                    <div key={group.language}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">{group.label}</p>
                      {group.countries.map((country) => (
                        <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>

              {selectedCountries.length > 0 ? (
                selectedCountries.map((code) => {
                  const countryName = COUNTRY_NAME_BY_CODE[code] || code;
                  const content = countryContent[code] || { title: "", description: "" };
                  return (
                    <div key={code} className="space-y-2 pb-3 border-b border-slate-100 dark:border-border last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">{countryName}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCountries((prev) => prev.filter((c) => c !== code));
                            setCountryContent((prev) => {
                              const copy = { ...prev };
                              delete copy[code];
                              return copy;
                            });
                          }}
                          className="text-slate-400 hover:text-red-500 p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <Input
                        value={content.title || ""}
                        onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, title: e.target.value } }))}
                        placeholder={t("adv.titleForCountry")}
                        className="min-h-[44px]"
                      />
                      <Input
                        value={content.description || ""}
                        onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, description: e.target.value } }))}
                        placeholder={t("adv.descriptionForCountry")}
                        className="min-h-[44px]"
                      />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">{t("ca.noCountriesAdded")}</p>
              )}
            </div>

            {/* Per-language title/description/CTA overrides */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.languageContent")}</h3>
              </div>
              <p className="text-xs text-slate-400">{t("ca.languageContentDesc")}</p>

              {/* Language picker for overrides */}
              <Select value="" onValueChange={(code) => { if (!selectedLanguages.includes(code)) setSelectedLanguages((prev) => [...prev, code]); }}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={t("ca.addLanguageForTranslation")} /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_LANGUAGES.filter((l) => l.code !== "en").map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.native_name || l.name} ({l.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedLanguages.length > 0 ? (
                selectedLanguages.map((code) => {
                  const langName = getLanguageNativeName(code) || code;
                  const content = languageContent[code] || { title: "", description: "", cta: "" };
                  return (
                    <div key={code} className="space-y-2 pb-3 border-b border-slate-100 dark:border-border last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">{langName} ({code})</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLanguages((prev) => prev.filter((c) => c !== code));
                            setLanguageContent((prev) => {
                              const copy = { ...prev };
                              delete copy[code];
                              return copy;
                            });
                          }}
                          className="text-slate-400 hover:text-red-500 p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <Input
                        value={content.title || ""}
                        onChange={(e) => setLanguageContent((prev) => ({ ...prev, [code]: { ...content, title: e.target.value } }))}
                        placeholder={t("adv.titleForLanguage")}
                        className="min-h-[44px]"
                      />
                      <Input
                        value={content.description || ""}
                        onChange={(e) => setLanguageContent((prev) => ({ ...prev, [code]: { ...content, description: e.target.value } }))}
                        placeholder={t("adv.descriptionForLanguage")}
                        className="min-h-[44px]"
                      />
                      <Input
                        value={content.cta || ""}
                        onChange={(e) => setLanguageContent((prev) => ({ ...prev, [code]: { ...content, cta: e.target.value } }))}
                        placeholder={t("adv.ctaForLanguage")}
                        className="min-h-[44px]"
                      />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">{t("ca.noLanguagesAdded")}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} className="flex-1 bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
              {editing ? t("ca.save") : t("ca.create")}
            </Button>
            {editing && (
              <Button onClick={resetForm} variant="outline" className="min-h-[44px]">{t("ca.cancel")}</Button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : ads.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">{t("ca.noAds")}</p>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className={`rounded-xl p-3 ${ad.bg_class || "bg-slate-100"} relative`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {ad.logo_url && (
                    <div className="w-9 h-9 rounded bg-white/90 p-0.5 shrink-0 flex items-center justify-center">
                      <img src={ad.logo_url} alt={ad.title} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${ad.text_class || "text-white"} truncate`}>{ad.title}</p>
                    <p className={`text-xs ${ad.text_class || "text-white"} opacity-90 truncate`}>{ad.description}</p>
                    <p className={`text-[10px] ${ad.text_class || "text-white"} opacity-75 mt-0.5`}>
                      {PLACEMENTS.find(p => p.value === ad.placement)?.label || t("ca.all")}
                    </p>
                    {ad.status === "pending_review" && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        {AD_STATUS_LABELS.pending_review}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && ad.status === "pending_review" && (
                    <button
                      onClick={() => approveAd(ad)}
                      className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`}
                      title={t("ca.approveChanges")}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => toggleActive(ad)}
                    className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`}
                    title={ad.is_active ? t("ca.deactivate") : t("ca.activate")}
                  >
                    {ad.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEdit(ad)}
                    className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`}
                    title={t("ca.edit")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => remove(ad.id)}
                      className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`}
                      title={t("ca.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}