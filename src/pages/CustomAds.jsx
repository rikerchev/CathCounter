import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { DEFAULT_LANGUAGES, getLanguageNativeName } from "@/lib/languages";
import { Plus, Trash2, Pencil, X, Eye, EyeOff, Upload, Loader2, Check, Globe, Languages, Store, Waves, ArrowUp, ArrowDown, Clock } from "lucide-react";
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
import { computeAdExpiry, daysUntil } from "@/lib/adBilling";
import PaymentInfoCard from "@/components/PaymentInfoCard";

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

const DURATION_OPTIONS = [1, 2, 3, 6, 12];

// v3.26 — admin-assigned merchant banner rotation. A banner can show one or
// more approved merchants (water_bodies/venues) instead of a manually typed
// title/logo/link — see the `merchants` column comment in
// entities.generated.ts and src/components/AdBannerItem.jsx's
// rotation-resolution logic. The interval is always stored in minutes; this
// is just the flexible minute/hour/day unit picker shown in the UI.
const ROTATION_UNIT_KEYS = [
  { value: "minutes", labelKey: "ca.rotationUnitMinutes" },
  { value: "hours", labelKey: "ca.rotationUnitHours" },
  { value: "days", labelKey: "ca.rotationUnitDays" },
];

function rotationMinutesToUi(minutes) {
  const n = Number(minutes);
  if (!n || n <= 0) return { value: "30", unit: "minutes" };
  if (n % 1440 === 0) return { value: String(n / 1440), unit: "days" };
  if (n % 60 === 0) return { value: String(n / 60), unit: "hours" };
  return { value: String(n), unit: "minutes" };
}

function rotationUiToMinutes(value, unit) {
  const n = Math.max(1, Math.round(Number(value)) || 1);
  if (unit === "days") return n * 1440;
  if (unit === "hours") return n * 60;
  return n;
}

// v3.30 — a second, INDEPENDENT rotation concept from the one above: this
// one rotates DIFFERENT custom_ads rows sharing one exact placement+
// position slot, instead of merchant snapshots within a single row. An ad
// opts in by turning this on; two or more opted-in ads on the same slot
// then take turns instead of stacking, each shown for its own configured
// number of seconds (stored in rotation_seconds) in a repeating cycle. See
// src/lib/adCache.js's applyCustomAdRotation().
const ROTATION_DISPLAY_UNIT_KEYS = [
  { value: "seconds", labelKey: "ca.rotationUnitSeconds" },
  { value: "minutes", labelKey: "ca.rotationUnitMinutes" },
  { value: "hours", labelKey: "ca.rotationUnitHours" },
];

function rotationSecondsToUi(seconds) {
  const n = Number(seconds);
  if (!n || n <= 0) return { value: "10", unit: "seconds" };
  if (n % 3600 === 0) return { value: String(n / 3600), unit: "hours" };
  if (n % 60 === 0) return { value: String(n / 60), unit: "minutes" };
  return { value: String(n), unit: "seconds" };
}

function rotationUiToSeconds(value, unit) {
  const n = Math.max(1, Math.round(Number(value)) || 1);
  if (unit === "hours") return n * 3600;
  if (unit === "minutes") return n * 60;
  return n;
}

const BANNER_POSITION_KEYS = [
  { value: "top", labelKey: "ca.bannerPositionTop" },
  { value: "bottom", labelKey: "ca.bannerPositionBottom" },
];

const BANNER_SIZE_KEYS = [
  { value: "compact", labelKey: "ca.bannerSizeCompact" },
  { value: "normal", labelKey: "ca.bannerSizeNormal" },
  { value: "large", labelKey: "ca.bannerSizeLarge" },
];

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
  banner_position: "top",
  banner_size: "normal",
  status: "active",
  countries: "all",
  country_content: "",
  language_content: "",
  advertiser_email: "",
  starts_at: "",
  duration_months: "",
  // v3.26 — array of {type, id, name, logo_url, logo_size} merchant
  // snapshots (not the raw stored string, which is JSON-in-TEXT — see
  // save()/startEdit()). Empty = this banner behaves exactly as before.
  merchants: [],
};

export default function CustomAdsManager() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const PLACEMENTS = Object.keys(PLACEMENT_KEYS).map((k) => ({ value: k, label: t(PLACEMENT_KEYS[k]) }));
  const BG_OPTIONS = BG_OPTION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));
  const BANNER_POSITIONS = BANNER_POSITION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const BANNER_SIZES = BANNER_SIZE_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const ROTATION_UNITS = ROTATION_UNIT_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const ROTATION_DISPLAY_UNITS = ROTATION_DISPLAY_UNIT_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const AD_STATUS_LABELS = {};
  for (const k in AD_STATUS_KEYS) AD_STATUS_LABELS[k] = t(AD_STATUS_KEYS[k]);
  const MERCHANT_TYPE_LABELS = { water_body: t("mr.typeWaterBody"), venue: t("mr.typeVenue") };
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
  // When true, this ad is ONLY shown to the languages in `selectedLanguages`
  // (the same list used for the per-language text below) — this is what
  // lets one placement (e.g. "Активна сесия") carry a different sponsor per
  // language instead of one ad taking over that placement for every
  // language. When false (default), the ad shows to everyone; any entries
  // in `selectedLanguages`/`languageContent` still just override the text
  // shown to that language.
  const [languageRestricted, setLanguageRestricted] = useState(false);
  // The language the main title/description fields above are actually
  // written in. This used to be an implicit gap: "restrict to languages"
  // only ever collected languages the admin explicitly *added* for
  // translation, so an ad written in Bulgarian and then also "added" for
  // English (to get an English translation) ended up with languages="en"
  // only — Bulgarian, its own base language, was never in the list, so the
  // ad silently stopped showing to Bulgarian users the moment it was
  // restricted. Now this is a required, separate field whenever
  // restricting, and it's always folded into the saved `languages` list —
  // the ad's own language can never be silently left out.
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [translatingLang, setTranslatingLang] = useState(null);
  const [translatingAll, setTranslatingAll] = useState(false);
  // Whether the create-new-ad form is open. Previously the "+ Нова" button
  // only reset the form fields but never made the form panel itself appear
  // once at least one ad already existed (it was shown only while editing,
  // or when the list was completely empty) — clicking it silently did
  // nothing. This flag is what the form's visibility now depends on.
  const [creatingNew, setCreatingNew] = useState(false);
  // The starts_at/duration_months this ad had when the edit form was
  // opened (null when creating a brand new ad). save() compares against
  // this to decide whether the billing period actually changed — only
  // then does it reset the renewal/expiry notice flags, so unrelated edits
  // (title, logo, ...) don't accidentally restart the notice cycle.
  const [editingOriginalPeriod, setEditingOriginalPeriod] = useState(null);
  // v3.26 — approved water bodies + venues, fetched once for the "Търговци
  // в банера" add-dropdown (admin only — merchant assignment is an
  // admin-only action). rotationValue/rotationUnit are the UI-only
  // number+unit pair for form.merchant_rotation_minutes (see
  // rotationMinutesToUi/rotationUiToMinutes above).
  const [approvedMerchants, setApprovedMerchants] = useState([]);
  const [rotationValue, setRotationValue] = useState("30");
  const [rotationUnit, setRotationUnit] = useState("minutes");
  // v3.30 — UI-only state for form.rotation_seconds (see
  // rotationSecondsToUi/rotationUiToSeconds above) — whether THIS ad takes
  // turns with other ads sharing its exact placement+position, and for how
  // long each turn lasts.
  const [rotationDisplayEnabled, setRotationDisplayEnabled] = useState(false);
  const [rotationDisplayValue, setRotationDisplayValue] = useState("10");
  const [rotationDisplayUnit, setRotationDisplayUnit] = useState("seconds");

  useEffect(() => {
    loadAds();
  }, []);

  const isAdmin = hasRole(user, "admin");

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([base44.entities.WaterBody.list(), base44.entities.Venue.list()])
      .then(([wbList, venueList]) => {
        const merged = [
          ...(wbList || []).filter((w) => w.status === "approved").map((w) => ({ ...w, _type: "water_body" })),
          ...(venueList || []).filter((v) => v.status === "approved").map((v) => ({ ...v, _type: "venue" })),
        ];
        setApprovedMerchants(merged);
      })
      .catch(() => setApprovedMerchants([]));
  }, [isAdmin]);

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
    let parsedMerchants = [];
    try {
      parsedMerchants = ad.merchants ? JSON.parse(ad.merchants) : [];
    } catch {
      parsedMerchants = [];
    }
    const rotUi = rotationMinutesToUi(ad.merchant_rotation_minutes);
    setRotationValue(rotUi.value);
    setRotationUnit(rotUi.unit);
    const rotDisplayUi = rotationSecondsToUi(ad.rotation_seconds);
    setRotationDisplayEnabled(Number(ad.rotation_seconds) > 0);
    setRotationDisplayValue(rotDisplayUi.value);
    setRotationDisplayUnit(rotDisplayUi.unit);
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
      banner_position: ad.banner_position || "top",
      banner_size: ad.banner_size || "normal",
      status: ad.status || "active",
      countries,
      country_content: ad.country_content || "",
      language_content: ad.language_content || "",
      advertiser_email: ad.advertiser_email || "",
      starts_at: ad.starts_at || "",
      duration_months: ad.duration_months != null ? String(ad.duration_months) : "",
      merchants: parsedMerchants,
    });
    setEditingOriginalPeriod({
      starts_at: ad.starts_at || "",
      duration_months: ad.duration_months != null ? String(ad.duration_months) : "",
    });
    // Also include countries that have per-country content overrides
    const overrideCodes = Object.keys(parsedContent);
    const allCodes = [...new Set([...codes, ...overrideCodes])];
    setTargetAllCountries(isAll);
    setSelectedCountries(allCodes);
    setCountryContent(parsedContent);

    const languages = ad.languages || "all";
    const isRestricted = languages !== "all";
    const restrictedCodes = isRestricted ? languages.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const contentCodes = Object.keys(parsedLangContent);
    // The primary language is a restricted code with no translation
    // override — that's the one language whose text is the main
    // title/description fields themselves, not a translated copy. If every
    // restricted code already has an override (or there are none), this is
    // an older/broken ad with no primary language recorded — the field
    // below starts empty and the admin must pick one before saving again.
    const inferredPrimary = restrictedCodes.find((c) => !contentCodes.includes(c)) || "";
    setPrimaryLanguage(inferredPrimary);
    // The editable translation-row list is the union of "languages that
    // already have translated text" and "restricted languages other than
    // the inferred primary one" (the primary language has its own field
    // above and doesn't need a translation row — its text IS the main
    // title/description).
    setSelectedLanguages(
      [...new Set([...contentCodes, ...restrictedCodes])].filter((c) => c !== inferredPrimary)
    );
    setLanguageContent(parsedLangContent);
    setLanguageRestricted(isRestricted);
  }

  function resetForm() {
    setEditing(null);
    setCreatingNew(false);
    setForm(emptyAd);
    setSelectedCountries([]);
    setCountryContent({});
    setLanguageContent({});
    setSelectedLanguages([]);
    setTargetAllCountries(true);
    setLanguageRestricted(false);
    setPrimaryLanguage("");
    setEditingOriginalPeriod(null);
    setRotationValue("30");
    setRotationUnit("minutes");
    setRotationDisplayEnabled(false);
    setRotationDisplayValue("10");
    setRotationDisplayUnit("seconds");
  }

  // v3.26 — add/remove/reorder merchants attached to this banner. Each
  // entry is a denormalized SNAPSHOT taken at attach time (name/logo/
  // logo_size), not a live reference — see the `merchants` column comment
  // in entities.generated.ts for why.
  function addMerchant(key) {
    if (!key) return;
    const [mtype, mid] = key.split(":");
    const merchant = approvedMerchants.find((m) => m._type === mtype && m.id === mid);
    if (!merchant) return;
    setForm((prev) => ({
      ...prev,
      merchants: [
        ...(prev.merchants || []),
        {
          type: mtype,
          id: merchant.id,
          name: merchant.name || "",
          logo_url: merchant.logo_url || "",
          logo_size: merchant.logo_size || "auto",
        },
      ],
    }));
  }

  function removeMerchant(index) {
    setForm((prev) => ({ ...prev, merchants: (prev.merchants || []).filter((_, i) => i !== index) }));
  }

  function moveMerchant(index, dir) {
    setForm((prev) => {
      const arr = [...(prev.merchants || [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...prev, merchants: arr };
    });
  }

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Adds a language to the editable list and immediately kicks off an
  // auto-translation for it (still editable afterwards) — so enabling a
  // language for this ad translates it right away instead of requiring a
  // separate manual step.
  const addLanguage = (code) => {
    if (selectedLanguages.includes(code)) return;
    setSelectedLanguages((prev) => [...prev, code]);
    autoTranslateLanguage(code);
  };

  const removeLanguage = (code) => {
    setSelectedLanguages((prev) => prev.filter((c) => c !== code));
    setLanguageContent((prev) => {
      const copy = { ...prev };
      delete copy[code];
      return copy;
    });
  };

  async function autoTranslateLanguage(code) {
    if (!form.title && !form.description) return;
    setTranslatingLang(code);
    try {
      const langName = getLanguageNativeName(code) || code;
      const prompt = `Translate the following advertisement copy into ${langName}. Return ONLY a valid JSON object with keys "title" and "description". Keep any {placeholders} unchanged and keep it as short/punchy as the original.

Title: ${form.title}
Description: ${form.description}`;
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
      });
      if (res && (res.title || res.description)) {
        setLanguageContent((prev) => ({
          ...prev,
          [code]: {
            ...(prev[code] || {}),
            title: res.title || prev[code]?.title || "",
            description: res.description || prev[code]?.description || "",
          },
        }));
        toast({ title: t("ca.translateDone") });
      } else {
        toast({ title: t("ca.translateError") });
      }
    } catch (e) {
      toast({ title: t("ca.translateError"), description: e.message });
    } finally {
      setTranslatingLang(null);
    }
  }

  async function autoTranslateAllLanguages() {
    setTranslatingAll(true);
    for (const code of selectedLanguages) {
      await autoTranslateLanguage(code);
    }
    setTranslatingAll(false);
  }

  async function save() {
    const hasMerchants = (form.merchants || []).length > 0;
    // When one or more merchants are attached, the title/logo/link are
    // resolved automatically from them at render time (AdBannerItem.jsx) —
    // see the disabled fields + note in the form below — so the manual
    // fields are no longer required.
    if (!hasMerchants && (!form.title || !form.description || !form.link)) {
      toast({ title: t("adv.fillAllFields") });
      return;
    }
    if (languageRestricted && !primaryLanguage) {
      toast({ title: t("ca.noPrimaryLanguage") });
      return;
    }
    // The primary language (the one the main title/description are
    // actually written in) is always folded in here, in addition to
    // whatever extra translated languages were added — this is what
    // guarantees an ad restricted to specific languages can never silently
    // exclude its own base language.
    const languagesToSave = languageRestricted
      ? [...new Set([primaryLanguage, ...selectedLanguages])].join(",")
      : "all";
    try {
      const countries = targetAllCountries ? "all" : selectedCountries.join(",");
      const expiresAt = computeAdExpiry(form.starts_at, form.duration_months);
      // Only reset the renewal/expiry notice flags when the billing period
      // itself actually changed (new ad, or starts_at/duration_months
      // edited) — an unrelated edit (title, logo, ...) must not silently
      // restart the notice cycle for an ad that's already close to expiry.
      const periodChanged =
        !editingOriginalPeriod ||
        editingOriginalPeriod.starts_at !== (form.starts_at || "") ||
        editingOriginalPeriod.duration_months !== (form.duration_months || "");
      const payload = {
        ...form,
        // When merchants are attached, fall back to the first one's name so
        // the admin list (and any code path that still reads ad.title
        // directly) has something reasonable — the actual display on the
        // public banner always goes through AdBannerItem.jsx's
        // merchant-resolution logic instead, which ignores this value.
        title: hasMerchants ? form.title || form.merchants[0]?.name || "" : form.title,
        countries,
        languages: languagesToSave,
        country_content: JSON.stringify(countryContent),
        language_content: JSON.stringify(languageContent),
        advertiser_email: form.advertiser_email || null,
        starts_at: form.starts_at || null,
        duration_months: form.duration_months ? Number(form.duration_months) : null,
        expires_at: expiresAt,
        merchants: JSON.stringify(form.merchants || []),
        merchant_rotation_minutes: hasMerchants && form.merchants.length > 1
          ? rotationUiToMinutes(rotationValue, rotationUnit)
          : null,
        // v3.30 — this ad opts into taking turns with other ads sharing its
        // exact placement+position (see applyCustomAdRotation() in
        // adCache.js) for this many seconds per turn. null = keeps stacking
        // as before (default, unchanged behavior).
        rotation_seconds: rotationDisplayEnabled
          ? rotationUiToSeconds(rotationDisplayValue, rotationDisplayUnit)
          : null,
      };
      if (periodChanged) {
        payload.renewal_notice_sent = false;
        payload.expiry_notice_sent = false;
      }
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
      const activating = !ad.is_active;
      try {
       await base44.entities.CustomAd.update(ad.id, { is_active: activating });
       await loadAds();
      } catch (e) {
       toast({ title: t("awb.error"), description: e.message });
    }
  }

  const hasMerchants = (form.merchants || []).length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("ca.title")}</h1>
         {!editing && !creatingNew && isAdmin && (
           <Button onClick={() => { resetForm(); setCreatingNew(true); }} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
             <Plus className="w-4 h-4 mr-1" /> {t("ca.new")}
          </Button>
        )}
      </div>

      {/* Quick reference for whoever is settling a renewal by hand — same
          card shown to advertisers on Advertise.jsx / MyAdRequests.jsx, so
          the admin doesn't have to jump to Настройка на интеграциите just
          to see what's currently configured. */}
      {isAdmin && <PaymentInfoCard />}

      {/* Form */}
      {(editing || creatingNew || (ads.length === 0 && isAdmin)) && (
        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">
              {editing ? t("ca.editing") : t("ca.newAd")}
            </h2>
            {(editing || creatingNew) && (
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
                disabled={hasMerchants}
              />
            </div>
            <div>
              <Label>{t("ca.adDescription")}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("adv.descriptionPlaceholder")}
                className="min-h-[44px]"
                disabled={hasMerchants}
              />
            </div>
            <div>
              <Label>{t("ca.adLink")}</Label>
              <Input
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder={t("ca.linkPlaceholder")}
                className="min-h-[44px]"
                disabled={hasMerchants}
              />
            </div>
            <div className={hasMerchants ? "opacity-50 pointer-events-none" : ""}>
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
                    disabled={uploadingLogo || hasMerchants}
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

            {/* v3.26 — attach one or more approved merchants to this
                banner: the banner then auto-displays their logo + name
                (rotating between them, if more than one) instead of the
                manually typed title/logo/link above. See
                AdBannerItem.jsx's rotation-resolution logic. */}
            {isAdmin && (
              <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("ca.merchantsSection")}</h3>
                </div>
                <p className="text-xs text-slate-400">{t("ca.merchantsHint")}</p>

                <Select value="" onValueChange={addMerchant}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder={t("ca.addMerchantPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedMerchants
                      .filter((m) => !(form.merchants || []).some((fm) => fm.type === m._type && fm.id === m.id))
                      .map((m) => (
                        <SelectItem key={`${m._type}:${m.id}`} value={`${m._type}:${m.id}`}>
                          {MERCHANT_TYPE_LABELS[m._type]} — {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {approvedMerchants.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-1">{t("ca.noApprovedMerchants")}</p>
                )}

                {hasMerchants && (
                  <div className="space-y-2">
                    {form.merchants.map((m, idx) => (
                      <div
                        key={`${m.type}:${m.id}`}
                        className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-accent/40 p-2"
                      >
                        <div className="w-8 h-8 rounded bg-white border border-slate-200 dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                          {m.logo_url ? (
                            <img src={m.logo_url} alt={m.name} className="w-full h-full object-contain" />
                          ) : m.type === "water_body" ? (
                            <Waves className="w-4 h-4 text-slate-300" />
                          ) : (
                            <Store className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-foreground truncate">{m.name}</p>
                          <p className="text-[10px] text-slate-400">{MERCHANT_TYPE_LABELS[m.type]}</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveMerchant(idx, -1)}
                            disabled={idx === 0}
                            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent disabled:opacity-30"
                            title={t("ca.moveUp")}
                          >
                            <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMerchant(idx, 1)}
                            disabled={idx === form.merchants.length - 1}
                            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent disabled:opacity-30"
                            title={t("ca.moveDown")}
                          >
                            <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMerchant(idx)}
                            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent"
                            title={t("ca.removeMerchant")}
                          >
                            <X className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hasMerchants && form.merchants.length > 1 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-600" />
                      <Label className="mb-0">{t("ca.rotationInterval")}</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        min="1"
                        value={rotationValue}
                        onChange={(e) => setRotationValue(e.target.value)}
                        className="min-h-[44px]"
                      />
                      <Select value={rotationUnit} onValueChange={setRotationUnit}>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROTATION_UNITS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-slate-400">{t("ca.rotationIntervalDesc")}</p>
                  </div>
                )}

                {hasMerchants && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t("ca.merchantsAutoNote")}</p>
                )}
              </div>
            )}

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
            {/* Where on the page the banner sits, and how much room it
                takes. Several banners can share the same placement + same
                position (top or bottom) now — they stack one under another
                with a gap, in `sort_order`. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("ca.bannerPosition")}</Label>
                <Select value={form.banner_position} onValueChange={(v) => setForm({ ...form, banner_position: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANNER_POSITIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("ca.bannerSize")}</Label>
                <Select value={form.banner_size} onValueChange={(v) => setForm({ ...form, banner_size: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANNER_SIZES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* v3.30 — this ad can take turns with any OTHER ads that share
                its exact placement + position, instead of always stacking
                below them. Independent of the merchant rotation above (that
                one rotates merchant snapshots WITHIN a single ad row); this
                rotates entire, separate custom_ads rows. See
                applyCustomAdRotation() in src/lib/adCache.js. */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-600" />
                <Label className="mb-0">{t("ca.rotationDisplay")}</Label>
                <Switch
                  checked={rotationDisplayEnabled}
                  onCheckedChange={setRotationDisplayEnabled}
                  className="ml-auto"
                />
              </div>
              <p className="text-xs text-slate-400">{t("ca.rotationDisplayDesc")}</p>
              {rotationDisplayEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    min="1"
                    value={rotationDisplayValue}
                    onChange={(e) => setRotationDisplayValue(e.target.value)}
                    className="min-h-[44px]"
                  />
                  <Select value={rotationDisplayUnit} onValueChange={setRotationDisplayUnit}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROTATION_DISPLAY_UNITS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label>{t("ca.active")}</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>

            {/* Billing period + renewal notices — starts_at/duration_months
                are optional: leaving duration empty means "no expiry
                tracked" (e.g. a permanent house ad), matching how ads
                worked before this existed. */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("ca.periodSection")}</h3>
              <div>
                <Label>{t("ca.advertiserEmail")}</Label>
                <Input
                  type="email"
                  value={form.advertiser_email}
                  onChange={(e) => setForm({ ...form, advertiser_email: e.target.value })}
                  placeholder="advertiser@example.com"
                  className="min-h-[44px]"
                />
                <p className="text-xs text-slate-400 mt-1">{t("ca.advertiserEmailDesc")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("ca.startsAt")}</Label>
                  <Input
                    type="date"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
                <div>
                  <Label>{t("ca.duration")}</Label>
                  <Select
                    value={form.duration_months ? String(form.duration_months) : "none"}
                    onValueChange={(v) => setForm({ ...form, duration_months: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("ca.noDuration")}</SelectItem>
                      {DURATION_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>{m} {t("adv.months")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-slate-400">{t("ca.startsAtDesc")}</p>
              {form.starts_at && form.duration_months ? (
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                  {t("ca.expiresOn").replace("{date}", computeAdExpiry(form.starts_at, form.duration_months))}
                </p>
              ) : (
                <p className="text-xs text-slate-400">{t("ca.noExpiry")}</p>
              )}
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

            {/* Languages — one place to add a language, get it auto-translated
                right away (still fully editable), and optionally restrict the
                ad to only the languages added here. Restricting is what lets
                the very same placement carry a different sponsor per
                language (e.g. a Bulgarian-only ad on "Активна сесия" leaves
                that placement free for an English or German advertiser). */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.languageContent")}</h3>
                </div>
                {selectedLanguages.length > 0 && (
                  <button
                    type="button"
                    onClick={autoTranslateAllLanguages}
                    disabled={translatingAll || !!translatingLang}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-cyan-50 dark:bg-accent text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 disabled:opacity-50"
                  >
                    {translatingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {t("ca.autoTranslateAll")}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">{t("ca.languageContentDesc")}</p>

              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={languageRestricted}
                  onChange={(e) => setLanguageRestricted(e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-600"
                />
                <span className="text-sm text-slate-600 dark:text-muted-foreground">{t("ca.restrictToLanguages")}</span>
              </label>

              {/* Required whenever restricting: the language the main
                  title/description fields above are actually written in.
                  Always folded into the saved `languages` list on save, so
                  restricting to specific languages can never silently
                  exclude the ad's own base language (see the note by
                  `primaryLanguage`'s useState above). */}
              {languageRestricted && (
                <div>
                  <Label>{t("ca.primaryLanguage")}</Label>
                  <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={t("ca.primaryLanguagePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>{l.native_name || l.name} ({l.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400 mt-1">{t("ca.primaryLanguageDesc")}</p>
                </div>
              )}

              {/* Language picker — adding a language makes it editable below
                  and immediately requests an auto-translation for it */}
              <Select value="" onValueChange={addLanguage}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={t("ca.addLanguageForTranslation")} /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_LANGUAGES.map((l) => (
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
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => autoTranslateLanguage(code)}
                            disabled={translatingLang === code || translatingAll || (!form.title && !form.description)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-accent text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 disabled:opacity-50"
                            title={t("ca.autoTranslate")}
                          >
                            {translatingLang === code ? <Loader2 className="w-3 h-3 animate-spin" /> : t("ca.autoTranslate")}
                          </button>
                          <button type="button" onClick={() => removeLanguage(code)} className="text-slate-400 hover:text-red-500 p-1">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
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
            {(editing || creatingNew) && (
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
                      {" · "}
                      {!ad.languages || ad.languages === "all"
                        ? t("ca.allLanguagesTarget")
                        : ad.languages.split(",").map((c) => getLanguageNativeName(c.trim()) || c.trim()).join(", ")}
                      {" · "}
                      {BANNER_POSITIONS.find((p) => p.value === (ad.banner_position || "top"))?.label}
                      {" · "}
                      {BANNER_SIZES.find((s) => s.value === (ad.banner_size || "normal"))?.label}
                    </p>
                    {ad.status === "pending_review" && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        {AD_STATUS_LABELS.pending_review}
                      </span>
                    )}
                    {ad.expires_at && (() => {
                      const left = daysUntil(ad.expires_at);
                      const urgent = left <= 7;
                      const expired = left < 0;
                      // Build the display Date from local (not UTC) date
                      // parts — new Date("YYYY-MM-DD") parses as UTC
                      // midnight, which toLocaleDateString() can then roll
                      // back a day in timezones behind UTC.
                      const [ey, em, ed] = ad.expires_at.split("-").map(Number);
                      const expiryLocal = new Date(ey, (em || 1) - 1, ed || 1);
                      return (
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${expired ? "bg-red-100 text-red-700" : urgent ? "bg-amber-100 text-amber-700" : "bg-white/20 text-white/90"}`}>
                          {t("ca.expiresOn").replace("{date}", expiryLocal.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }))}
                        </span>
                      );
                    })()}
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