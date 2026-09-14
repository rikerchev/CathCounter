import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";
import { DEFAULT_LANGUAGES, getLanguageNativeName } from "@/lib/languages";
import {
  Plus, Trash2, Pencil, X, Eye, EyeOff, Upload, Loader2, Check, Globe, Languages, Megaphone,
} from "lucide-react";
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
import { ALL_COUNTRIES, COUNTRY_GROUPS, COUNTRY_NAME_BY_CODE } from "@/lib/countries";
import { calculateCountryPrice, getCountryMultiplier } from "@/lib/pricing";
import { computeAdExpiry, daysUntil } from "@/lib/adBilling";
import { bucketAdsByPosition } from "@/lib/adCache";
import PaymentInfoCard from "@/components/PaymentInfoCard";

// v2.65 — AdManagement.jsx replaces the two previously-separate screens
// "Рекламни слотове" (AdminAdSlots.jsx) and "Управление на реклами"
// (CustomAds.jsx). The confusion those two caused (an admin could see two
// live banners on a page but only manage one of them) came from them being
// two disconnected lists over two different entities — a real ad
// (CustomAd, no price of its own) and a sellable placement (AdSlot, has the
// price). This screen keeps both entities exactly as they were — no DB
// migration — but presents them together, per page, with a live-accurate
// illustration of what's actually showing so nothing is invisible anymore.

const PLACEMENT_KEYS = [
  { value: "all", key: "nav.allPages" },
  { value: "home", key: "nav.home" },
  { value: "session", key: "nav.activeSession" },
  { value: "log_catch", key: "nav.logCatch" },
  { value: "history", key: "nav.catchHistory" },
  { value: "sessions", key: "nav.sessions" },
  { value: "statistics", key: "nav.statistics" },
  { value: "locations", key: "nav.locations" },
  { value: "personal_best", key: "nav.personalBest" },
  { value: "bait_inventory", key: "nav.tackleInventory" },
  { value: "water_bodies", key: "nav.waterBodies" },
  { value: "competitions", key: "nav.competitions" },
  { value: "sector_reservations", key: "nav.sectorReservations" },
  { value: "advertise", key: "nav.advertise" },
  { value: "profile", key: "nav.profile" },
];

const BANNER_POSITION_KEYS = [
  { value: "top", labelKey: "ca.bannerPositionTop" },
  { value: "bottom", labelKey: "ca.bannerPositionBottom" },
];

const BANNER_SIZE_KEYS = [
  { value: "compact", labelKey: "ca.bannerSizeCompact" },
  { value: "normal", labelKey: "ca.bannerSizeNormal" },
  { value: "large", labelKey: "ca.bannerSizeLarge" },
];

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

const DURATION_OPTIONS = [1, 2, 3, 6, 12];

// Same visual scale as AdBannerItem.jsx (the component that renders these
// banners on the real site) — kept in sync by hand since this preview
// intentionally doesn't reuse that component directly (it renders inside a
// <Link>, which would try to navigate away when clicked here).
const LOGO_SIZE_CLASSES = {
  "16x16": "w-16 h-16",
  "32x16": "w-32 h-16",
  "48x16": "w-48 h-16",
  auto: "w-auto h-auto max-w-full max-h-24",
};

const SIZE_CLASSES = {
  compact: { wrap: "px-2 py-1", title: "text-xs", desc: "text-[10px]", logo: "w-10 h-10" },
  normal: { wrap: "px-2 py-1.5", title: "text-sm", desc: "text-[11px]", logo: "w-12 h-12" },
  large: { wrap: "px-3 py-2.5", title: "text-base", desc: "text-xs", logo: "w-16 h-16" },
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
  banner_position: "top",
  banner_size: "normal",
  status: "active",
  countries: "all",
  country_content: "",
  language_content: "",
  advertiser_email: "",
  starts_at: "",
  duration_months: "",
};

const emptySlot = {
  name: "",
  placement: "all",
  price_per_month: "",
  banner_position: "top",
  banner_size: "normal",
};

function formatCountryPrices(basePrice) {
  if (!basePrice || basePrice <= 0) return null;
  return ALL_COUNTRIES.map((c) => ({
    code: c.code,
    name: c.name,
    price: calculateCountryPrice(basePrice, c.code),
    multiplier: getCountryMultiplier(c.code),
  }));
}

// Mirrors pickAvailableSlot() in useEligibleAds.js exactly — the same rule
// that decides, on the real site, which AdSlot's placeholder shows when a
// position has no real ad yet: an exact-placement slot first, then a
// generic "all pages" one, and only among slots the admin hasn't hidden.
function pickPreviewSlot(slots, placement, position) {
  const eligible = (slots || []).filter(
    (s) => s.is_available !== false && (s.banner_position || "top") === position
  );
  return (
    eligible.find((s) => s.placement === placement) ||
    eligible.find((s) => s.placement === "all" || !s.placement) ||
    null
  );
}

// Mirrors makeSlotPlaceholderAd() in useEligibleAds.js — builds the same
// "Рекламирайте тук" placeholder shape from a slot, so the preview below
// shows admins exactly the banner real visitors see for an unsold slot.
function makeSlotPreviewAd(slot) {
  return {
    title: "ad.advertiseHereTitle",
    description: "ad.advertiseHereDesc",
    is_translation_key: true,
    logo_url: null,
    bg_class: "bg-gradient-to-r from-emerald-600 to-teal-600",
    text_class: "text-white",
    banner_size: slot.banner_size || "normal",
  };
}

// One banner's own visual bar inside the illustration — same colors/sizing
// rules as the live AdBannerItem.jsx, but a plain div (not a <Link>, which
// would navigate away on click here) with a pencil button to edit whatever
// this banner actually is (real ad or slot placeholder).
function PreviewBanner({ ad, isPlaceholder, onEdit, t }) {
  const size = SIZE_CLASSES[ad.banner_size] || SIZE_CLASSES.normal;
  const title = ad.is_translation_key ? t(ad.title) : ad.title;
  const description = ad.is_translation_key ? t(ad.description) : ad.description;
  return (
    <div className={`relative ${ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600"} rounded-lg ${size.wrap} my-1`}>
      {isPlaceholder && (
        <span className="absolute -top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full bg-white text-slate-700 font-semibold shadow-sm">
          {t("am.placeholderTag")}
        </span>
      )}
      <div className="flex items-center gap-3 w-full pr-8">
        {ad.logo_url && (
          <div className={`${LOGO_SIZE_CLASSES[ad.logo_size] || size.logo} rounded-lg shrink-0 flex items-center justify-center`}>
            <img src={ad.logo_url} alt={title} className="w-full h-full object-contain" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-center">
          <p className={`${size.title} font-bold ${ad.text_class || "text-white"} truncate`}>{title}</p>
          {description && (
            <p className={`${size.desc} ${ad.text_class || "text-white"} opacity-90 truncate`}>{description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={`absolute top-1/2 -translate-y-1/2 right-1.5 p-1.5 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`}
        title={t("ca.edit")}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AdManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isAdmin = hasRole(user, "admin");

  const PLACEMENTS = PLACEMENT_KEYS.map((p) => ({ value: p.value, label: t(p.key) }));
  const BANNER_POSITIONS = BANNER_POSITION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const BANNER_SIZES = BANNER_SIZE_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const BG_OPTIONS = BG_OPTION_KEYS.map((o) => ({ ...o, label: t(o.labelKey) }));
  const LOGO_SIZES = LOGO_SIZE_KEYS.map((o) => ({ ...o, label: o.labelKey ? t(o.labelKey) : o.label }));
  const AD_STATUS_LABELS = {};
  for (const k in AD_STATUS_KEYS) AD_STATUS_LABELS[k] = t(AD_STATUS_KEYS[k]);

  const [slots, setSlots] = useState([]);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placement, setPlacement] = useState("home");

  // ---- Slot (AdSlot) edit/create panel ----
  const [slotEditingId, setSlotEditingId] = useState(null);
  const [slotCreating, setSlotCreating] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlot);
  const [savingSlot, setSavingSlot] = useState(false);

  // ---- Ad (CustomAd) edit/create panel ----
  const [adEditing, setAdEditing] = useState(null);
  const [adCreating, setAdCreating] = useState(false);
  const [adForm, setAdForm] = useState(emptyAd);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [countryContent, setCountryContent] = useState({});
  const [languageContent, setLanguageContent] = useState({});
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [targetAllCountries, setTargetAllCountries] = useState(true);
  const [languageRestricted, setLanguageRestricted] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [translatingLang, setTranslatingLang] = useState(null);
  const [translatingAll, setTranslatingAll] = useState(false);
  const [editingOriginalPeriod, setEditingOriginalPeriod] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  if (user && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  async function loadAll() {
    try {
      let slotData = await base44.entities.AdSlot.list();
      // Same auto-seed as the old AdminAdSlots.jsx: every real page always
      // has its own slot (price 0 = "not for sale yet") so there's never a
      // page with literally nothing to price/position here.
      const existingPlacements = new Set((slotData || []).map((s) => s.placement));
      const missing = PLACEMENT_KEYS.filter((p) => p.value !== "all" && !existingPlacements.has(p.value));
      if (missing.length > 0) {
        await Promise.all(
          missing.map((p) =>
            base44.entities.AdSlot.create({
              name: t(p.key),
              placement: p.value,
              price_per_month: 0,
              is_available: true,
              status: "available",
              banner_position: "top",
              banner_size: "normal",
            })
          )
        );
        slotData = await base44.entities.AdSlot.list();
      }
      setSlots(slotData || []);

      const adData = await base44.entities.CustomAd.list("sort_order");
      setAds(adData || []);
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message });
    } finally {
      setLoading(false);
    }
  }

  // ================= Slot form =================

  function startCreateSlot(position) {
    resetAdForm();
    setSlotEditingId(null);
    setSlotForm({ ...emptySlot, placement, banner_position: position || "top" });
    setSlotCreating(true);
  }

  function startEditSlot(slot) {
    resetAdForm();
    setSlotCreating(false);
    setSlotEditingId(slot.id);
    setSlotForm({
      name: slot.name || "",
      placement: slot.placement || "all",
      price_per_month: String(slot.price_per_month ?? ""),
      banner_position: slot.banner_position || "top",
      banner_size: slot.banner_size || "normal",
      is_available: slot.is_available,
    });
  }

  function resetSlotForm() {
    setSlotEditingId(null);
    setSlotCreating(false);
    setSlotForm(emptySlot);
  }

  async function createSlot() {
    if (!slotForm.name || !slotForm.price_per_month) {
      toast({ title: t("aas.fillAllFields") });
      return;
    }
    setSavingSlot(true);
    try {
      await base44.entities.AdSlot.create({
        name: slotForm.name,
        placement: slotForm.placement,
        price_per_month: Number(slotForm.price_per_month),
        is_available: true,
        status: "available",
        banner_position: slotForm.banner_position,
        banner_size: slotForm.banner_size,
      });
      toast({ title: t("aas.slotCreated") });
      resetSlotForm();
      await loadAll();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    } finally {
      setSavingSlot(false);
    }
  }

  async function saveSlot() {
    if (!slotForm.name || !slotForm.price_per_month) {
      toast({ title: t("aas.fillAllFields") });
      return;
    }
    setSavingSlot(true);
    try {
      await base44.entities.AdSlot.update(slotEditingId, {
        name: slotForm.name,
        placement: slotForm.placement,
        price_per_month: Number(slotForm.price_per_month),
        banner_position: slotForm.banner_position,
        banner_size: slotForm.banner_size,
      });
      toast({ title: t("aas.slotUpdated") });
      resetSlotForm();
      await loadAll();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    } finally {
      setSavingSlot(false);
    }
  }

  async function toggleSlotAvailable(slot) {
    try {
      await base44.entities.AdSlot.update(slot.id, { is_available: !slot.is_available });
      await loadAll();
    } catch (e) {
      toast({ title: "Грешка", description: e.message });
    }
  }

  async function removeSlot(id) {
    try {
      await base44.entities.AdSlot.delete(id);
      toast({ title: t("aas.slotDeleted") });
      if (slotEditingId === id) resetSlotForm();
      await loadAll();
    } catch (e) {
      toast({ title: t("aas.deleteError"), description: e.message });
    }
  }

  // ================= Ad form =================

  function resetAdForm() {
    setAdEditing(null);
    setAdCreating(false);
    setAdForm(emptyAd);
    setSelectedCountries([]);
    setCountryContent({});
    setLanguageContent({});
    setSelectedLanguages([]);
    setTargetAllCountries(true);
    setLanguageRestricted(false);
    setPrimaryLanguage("");
    setEditingOriginalPeriod(null);
  }

  function startCreateAd(position) {
    resetSlotForm();
    resetAdForm();
    setAdForm({ ...emptyAd, placement, banner_position: position || "top" });
    setAdCreating(true);
  }

  function startEditAd(ad) {
    resetSlotForm();
    setAdCreating(false);
    setAdEditing(ad.id);
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
    setAdForm({
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
    });
    setEditingOriginalPeriod({
      starts_at: ad.starts_at || "",
      duration_months: ad.duration_months != null ? String(ad.duration_months) : "",
    });
    const overrideCodes = Object.keys(parsedContent);
    const allCodes = [...new Set([...codes, ...overrideCodes])];
    setTargetAllCountries(isAll);
    setSelectedCountries(allCodes);
    setCountryContent(parsedContent);

    const languages = ad.languages || "all";
    const isRestricted = languages !== "all";
    const restrictedCodes = isRestricted ? languages.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const contentCodes = Object.keys(parsedLangContent);
    const inferredPrimary = restrictedCodes.find((c) => !contentCodes.includes(c)) || "";
    setPrimaryLanguage(inferredPrimary);
    setSelectedLanguages(
      [...new Set([...contentCodes, ...restrictedCodes])].filter((c) => c !== inferredPrimary)
    );
    setLanguageContent(parsedLangContent);
    setLanguageRestricted(isRestricted);
  }

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

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
    if (!adForm.title && !adForm.description) return;
    setTranslatingLang(code);
    try {
      const langName = getLanguageNativeName(code) || code;
      const prompt = `Translate the following advertisement copy into ${langName}. Return ONLY a valid JSON object with keys "title" and "description". Keep any {placeholders} unchanged and keep it as short/punchy as the original.

Title: ${adForm.title}
Description: ${adForm.description}`;
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

  async function saveAd() {
    if (!adForm.title || !adForm.description || !adForm.link) {
      toast({ title: t("adv.fillAllFields") });
      return;
    }
    if (languageRestricted && !primaryLanguage) {
      toast({ title: t("ca.noPrimaryLanguage") });
      return;
    }
    const languagesToSave = languageRestricted
      ? [...new Set([primaryLanguage, ...selectedLanguages])].join(",")
      : "all";
    try {
      const countries = targetAllCountries ? "all" : selectedCountries.join(",");
      const expiresAt = computeAdExpiry(adForm.starts_at, adForm.duration_months);
      const periodChanged =
        !editingOriginalPeriod ||
        editingOriginalPeriod.starts_at !== (adForm.starts_at || "") ||
        editingOriginalPeriod.duration_months !== (adForm.duration_months || "");
      const payload = {
        ...adForm,
        countries,
        languages: languagesToSave,
        country_content: JSON.stringify(countryContent),
        language_content: JSON.stringify(languageContent),
        advertiser_email: adForm.advertiser_email || null,
        starts_at: adForm.starts_at || null,
        duration_months: adForm.duration_months ? Number(adForm.duration_months) : null,
        expires_at: expiresAt,
      };
      if (periodChanged) {
        payload.renewal_notice_sent = false;
        payload.expiry_notice_sent = false;
      }
      if (adEditing) {
        if (!isAdmin) payload.status = "pending_review";
        await base44.entities.CustomAd.update(adEditing, payload);
        toast({ title: isAdmin ? t("ca.adUpdated") : t("ca.changesForReview") });
      } else {
        await base44.entities.CustomAd.create(payload);
        toast({ title: t("ca.adCreated") });
      }
      resetAdForm();
      await loadAll();
    } catch (e) {
      toast({ title: t("ca.saveError"), description: e.message });
    }
  }

  async function removeAd(id) {
    try {
      await base44.entities.CustomAd.delete(id);
      toast({ title: t("ca.adDeleted") });
      if (adEditing === id) resetAdForm();
      await loadAll();
    } catch (e) {
      toast({ title: t("ca.deleteError"), description: e.message });
    }
  }

  async function approveAd(ad) {
    try {
      await base44.entities.CustomAd.update(ad.id, { status: "active" });
      toast({ title: t("ca.changesApproved") });
      await loadAll();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message });
    }
  }

  async function toggleAdActive(ad) {
    try {
      await base44.entities.CustomAd.update(ad.id, { is_active: !ad.is_active });
      await loadAll();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message });
    }
  }

  // ================= Preview + combined list for the selected page =================

  // Exactly the same bucketing rule the live site uses (adCache.js): ads
  // pinned to this exact page win over "all pages" ones, independently per
  // position — this is what makes the illustration below truthful.
  const activeAds = useMemo(() => ads.filter((a) => a.is_active && a.status !== "pending_review"), [ads]);
  const bucketed = useMemo(() => bucketAdsByPosition(activeAds, placement), [activeAds, placement]);

  const previewSlotTop = bucketed.top.length === 0 ? pickPreviewSlot(slots, placement, "top") : null;
  const previewSlotBottom = bucketed.bottom.length === 0 ? pickPreviewSlot(slots, placement, "bottom") : null;

  // The combined manageable list for this page: everything created
  // specifically for it, plus whichever "all pages" ad/slot is actually
  // filling a gap right now — tagged as a fallback so it's never a silent
  // mystery again (this is exactly the "2 banners on Начало, only 1 in
  // management" report that started this redesign).
  const exactAds = ads.filter((a) => a.placement === placement);
  const exactSlots = slots.filter((s) => s.placement === placement);
  const fallbackAdIds = new Set(exactAds.map((a) => a.id));
  const fallbackAds = [...bucketed.top, ...bucketed.bottom].filter(
    (a) => !fallbackAdIds.has(a.id) && (a.placement === "all" || !a.placement)
  );
  const fallbackSlotIds = new Set(exactSlots.map((s) => s.id));
  const fallbackSlots = [previewSlotTop, previewSlotBottom]
    .filter(Boolean)
    .filter((s) => !fallbackSlotIds.has(s.id))
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  const listRows = [
    ...exactAds.map((a) => ({ type: "ad", obj: a, fallback: false })),
    ...fallbackAds.map((a) => ({ type: "ad", obj: a, fallback: true })),
    ...exactSlots.map((s) => ({ type: "slot", obj: s, fallback: false })),
    ...fallbackSlots.map((s) => ({ type: "slot", obj: s, fallback: true })),
  ].sort((a, b) => {
    const posA = a.obj.banner_position || "top";
    const posB = b.obj.banner_position || "top";
    if (posA !== posB) return posA === "top" ? -1 : 1;
    return 0;
  });

  function renderZone(position) {
    const realAds = bucketed[position];
    if (realAds.length > 0) {
      return realAds.map((ad) => (
        <PreviewBanner key={ad.id} ad={ad} isPlaceholder={false} onEdit={() => startEditAd(ad)} t={t} />
      ));
    }
    const slot = position === "top" ? previewSlotTop : previewSlotBottom;
    if (slot) {
      return (
        <PreviewBanner
          key={slot.id}
          ad={makeSlotPreviewAd(slot)}
          isPlaceholder
          onEdit={() => startEditSlot(slot)}
          t={t}
        />
      );
    }
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-border py-4 text-center">
        <p className="text-xs text-slate-400">{t("am.emptyZone")}</p>
      </div>
    );
  }

  const anyFormOpen = slotEditingId || slotCreating || adEditing || adCreating;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("nav.adManagement")}</h1>
      </div>

      {isAdmin && <PaymentInfoCard />}

      {/* Page selector */}
      <div>
        <Label>{t("am.pageSelector")}</Label>
        <Select value={placement} onValueChange={(v) => { setPlacement(v); resetSlotForm(); resetAdForm(); }}>
          <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PLACEMENTS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {placement === "all" && (
        <p className="text-xs text-slate-400 -mt-3">{t("am.allPagesHint")}</p>
      )}

      {/* Illustration */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("am.previewTitle")}</h2>
          <div className="rounded-2xl bg-slate-100 dark:bg-accent/40 border border-slate-200 dark:border-border p-3 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-1 px-1">{t("am.topZone")}</p>
              <div className="rounded-xl bg-white/90 dark:bg-card/90 border border-slate-100 dark:border-border p-2">
                {renderZone("top")}
              </div>
              <div className="flex gap-3 mt-1.5 px-1">
                <button onClick={() => startCreateAd("top")} className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400 hover:underline">
                  {t("am.addAd")}
                </button>
                <button onClick={() => startCreateSlot("top")} className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground hover:underline">
                  {t("am.addSlot")}
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-slate-200/60 dark:bg-background/40 h-10 flex items-center justify-center">
              <span className="text-[10px] text-slate-400">···</span>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-1 px-1">{t("am.bottomZone")}</p>
              <div className="rounded-xl bg-white/90 dark:bg-card/90 border border-slate-100 dark:border-border p-2">
                {renderZone("bottom")}
              </div>
              <div className="flex gap-3 mt-1.5 px-1">
                <button onClick={() => startCreateAd("bottom")} className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400 hover:underline">
                  {t("am.addAd")}
                </button>
                <button onClick={() => startCreateSlot("bottom")} className="text-[11px] font-medium text-slate-500 dark:text-muted-foreground hover:underline">
                  {t("am.addSlot")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slot form */}
      {(slotCreating || slotEditingId) && (
        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">
              {slotEditingId ? t("aas.editing") : t("aas.newSlot")}
            </h2>
            <button onClick={resetSlotForm} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-accent">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label>{t("aas.name")}</Label>
              <Input
                value={slotForm.name}
                onChange={(e) => setSlotForm({ ...slotForm, name: e.target.value })}
                placeholder={t("aas.namePlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("aas.placement")}</Label>
                <Select value={slotForm.placement} onValueChange={(v) => setSlotForm({ ...slotForm, placement: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("aas.basePrice")}</Label>
                <Input
                  type="number"
                  step="any"
                  value={slotForm.price_per_month}
                  onChange={(e) => setSlotForm({ ...slotForm, price_per_month: e.target.value })}
                  placeholder="9.99"
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("ca.bannerPosition")}</Label>
                <Select value={slotForm.banner_position} onValueChange={(v) => setSlotForm({ ...slotForm, banner_position: v })}>
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
                <Select value={slotForm.banner_size} onValueChange={(v) => setSlotForm({ ...slotForm, banner_size: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANNER_SIZES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {slotForm.price_per_month > 0 && (
              <div className="rounded-lg bg-cyan-50 dark:bg-accent p-3 space-y-1">
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">{t("aas.autoPrices")}:</p>
                <div className="flex flex-wrap gap-1">
                  {ALL_COUNTRIES.slice(0, 8).map((c) => (
                    <span key={c.code} className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-card text-cyan-700 dark:text-cyan-400">
                      {c.name}: €{calculateCountryPrice(Number(slotForm.price_per_month), c.code).toFixed(2)}
                    </span>
                  ))}
                  {ALL_COUNTRIES.length > 8 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-slate-400">+{ALL_COUNTRIES.length - 8} {t("aas.more")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <Button
            onClick={slotEditingId ? saveSlot : createSlot}
            disabled={savingSlot}
            className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px] w-full"
          >
            {slotEditingId ? t("aas.save") : t("aas.create")}
          </Button>
        </div>
      )}

      {/* Ad form */}
      {(adCreating || adEditing) && (
        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">
              {adEditing ? t("ca.editing") : t("ca.newAd")}
            </h2>
            <button onClick={resetAdForm} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-accent">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <Label>{t("ca.adTitle")}</Label>
              <Input
                value={adForm.title}
                onChange={(e) => setAdForm({ ...adForm, title: e.target.value })}
                placeholder={t("adv.titlePlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.adDescription")}</Label>
              <Input
                value={adForm.description}
                onChange={(e) => setAdForm({ ...adForm, description: e.target.value })}
                placeholder={t("adv.descriptionPlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.adLink")}</Label>
              <Input
                value={adForm.link}
                onChange={(e) => setAdForm({ ...adForm, link: e.target.value })}
                placeholder={t("ca.linkPlaceholder")}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label>{t("ca.advertiserLogo")}</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                  {adForm.logo_url ? (
                    <img src={adForm.logo_url} alt={t("ca.logoAlt")} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Upload className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <label className="flex-1 cursor-pointer">
                  <span className="inline-flex items-center justify-center gap-2 min-h-[44px] w-full rounded-md border border-input bg-transparent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                    {uploadingLogo ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t("adv.uploading")}</>
                    ) : (
                      <><Upload className="w-4 h-4" /> {adForm.logo_url ? t("ca.changeLogo") : t("adv.uploadLogo")}</>
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
                        setAdForm((prev) => ({ ...prev, logo_url: file_url }));
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
                {adForm.logo_url && (
                  <button
                    type="button"
                    onClick={() => setAdForm({ ...adForm, logo_url: "" })}
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
              <Select value={adForm.logo_size} onValueChange={(v) => setAdForm({ ...adForm, logo_size: v })}>
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
                <Select value={adForm.bg_class} onValueChange={(v) => setAdForm({ ...adForm, bg_class: v })}>
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
                <Select value={adForm.placement} onValueChange={(v) => setAdForm({ ...adForm, placement: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("ca.bannerPosition")}</Label>
                <Select value={adForm.banner_position} onValueChange={(v) => setAdForm({ ...adForm, banner_position: v })}>
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
                <Select value={adForm.banner_size} onValueChange={(v) => setAdForm({ ...adForm, banner_size: v })}>
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANNER_SIZES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label>{t("ca.active")}</Label>
              <Switch checked={adForm.is_active} onCheckedChange={(v) => setAdForm({ ...adForm, is_active: v })} />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("ca.periodSection")}</h3>
              <div>
                <Label>{t("ca.advertiserEmail")}</Label>
                <Input
                  type="email"
                  value={adForm.advertiser_email}
                  onChange={(e) => setAdForm({ ...adForm, advertiser_email: e.target.value })}
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
                    value={adForm.starts_at}
                    onChange={(e) => setAdForm({ ...adForm, starts_at: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>
                <div>
                  <Label>{t("ca.duration")}</Label>
                  <Select
                    value={adForm.duration_months ? String(adForm.duration_months) : "none"}
                    onValueChange={(v) => setAdForm({ ...adForm, duration_months: v === "none" ? "" : v })}
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
              {adForm.starts_at && adForm.duration_months ? (
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                  {t("ca.expiresOn").replace("{date}", computeAdExpiry(adForm.starts_at, adForm.duration_months))}
                </p>
              ) : (
                <p className="text-xs text-slate-400">{t("ca.noExpiry")}</p>
              )}
            </div>

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

            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("adv.countryContent")}</h3>
              </div>
              <p className="text-xs text-slate-400">{t("ca.countryContentDesc")}</p>

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
                            disabled={translatingLang === code || translatingAll || (!adForm.title && !adForm.description)}
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
            <Button onClick={saveAd} className="flex-1 bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
              {adEditing ? t("ca.save") : t("ca.create")}
            </Button>
            <Button onClick={resetAdForm} variant="outline" className="min-h-[44px]">{t("ca.cancel")}</Button>
          </div>
        </div>
      )}

      {/* Combined list */}
      {!loading && !anyFormOpen && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("am.listTitle")}</h2>
          {listRows.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">{t("ca.noAds")}</p>
          ) : (
            <div className="space-y-2">
              {listRows.map((row) =>
                row.type === "slot" ? (
                  <SlotRow
                    key={`slot-${row.obj.id}`}
                    slot={row.obj}
                    fallback={row.fallback}
                    t={t}
                    PLACEMENTS={PLACEMENTS}
                    BANNER_POSITIONS={BANNER_POSITIONS}
                    BANNER_SIZES={BANNER_SIZES}
                    onEdit={() => startEditSlot(row.obj)}
                    onToggle={() => toggleSlotAvailable(row.obj)}
                    onDelete={() => removeSlot(row.obj.id)}
                  />
                ) : (
                  <AdRow
                    key={`ad-${row.obj.id}`}
                    ad={row.obj}
                    fallback={row.fallback}
                    t={t}
                    isAdmin={isAdmin}
                    PLACEMENTS={PLACEMENTS}
                    BANNER_POSITIONS={BANNER_POSITIONS}
                    BANNER_SIZES={BANNER_SIZES}
                    AD_STATUS_LABELS={AD_STATUS_LABELS}
                    onEdit={() => startEditAd(row.obj)}
                    onToggle={() => toggleAdActive(row.obj)}
                    onApprove={() => approveAd(row.obj)}
                    onDelete={() => removeAd(row.obj.id)}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, fallback, t, PLACEMENTS, BANNER_POSITIONS, BANNER_SIZES, onEdit, onToggle, onDelete }) {
  const countryList = formatCountryPrices(slot.price_per_month);
  return (
    <div className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-accent text-slate-500 dark:text-muted-foreground font-medium">
              {t("am.slotLabel")}
            </span>
            {fallback && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {t("am.fallbackTag")}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800 dark:text-foreground mt-0.5">{slot.name}</p>
          <p className="text-xs text-slate-400">
            {PLACEMENTS.find((p) => p.value === slot.placement)?.label} · €{slot.price_per_month}{t("am.perMonthShort")}
            {" · "}{BANNER_POSITIONS.find((p) => p.value === (slot.banner_position || "top"))?.label}
            {" · "}{BANNER_SIZES.find((s) => s.value === (slot.banner_size || "normal"))?.label}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {slot.status === "rented" && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{t("aas.rented")}</span>
          )}
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent" title={t("ca.edit")}>
            <Pencil className="w-4 h-4 text-cyan-600" />
          </button>
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
            title={slot.is_available ? t("aas.hideFromAdvertisers") : t("aas.showToAdvertisers")}
          >
            {slot.is_available ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
          </button>
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent">
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      </div>
      {countryList && (
        <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
          {countryList.map((c) => (
            <span key={c.code} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-accent text-cyan-700 dark:text-cyan-400">
              {c.name}: €{c.price.toFixed(2)} (×{c.multiplier})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AdRow({ ad, fallback, t, isAdmin, PLACEMENTS, BANNER_POSITIONS, BANNER_SIZES, AD_STATUS_LABELS, onEdit, onToggle, onApprove, onDelete }) {
  return (
    <div className={`rounded-xl p-3 ${ad.bg_class || "bg-slate-100"} relative`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {ad.logo_url && (
            <div className="w-9 h-9 rounded bg-white/90 p-0.5 shrink-0 flex items-center justify-center">
              <img src={ad.logo_url} alt={ad.title} className="w-full h-full object-contain" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-black/20 ${ad.text_class || "text-white"} font-medium`}>
                {t("am.adLabel")}
              </span>
              {fallback && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {t("am.fallbackTag")}
                </span>
              )}
            </div>
            <p className={`text-sm font-bold ${ad.text_class || "text-white"} truncate mt-0.5`}>{ad.title}</p>
            <p className={`text-xs ${ad.text_class || "text-white"} opacity-90 truncate`}>{ad.description}</p>
            <p className={`text-[10px] ${ad.text_class || "text-white"} opacity-75 mt-0.5`}>
              {PLACEMENTS.find((p) => p.value === ad.placement)?.label || t("ca.all")}
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
            <button onClick={onApprove} className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`} title={t("ca.approveChanges")}>
              <Check className="w-4 h-4" />
            </button>
          )}
          <button onClick={onToggle} className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`} title={ad.is_active ? t("ca.deactivate") : t("ca.activate")}>
            {ad.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`} title={t("ca.edit")}>
            <Pencil className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button onClick={onDelete} className={`p-2 rounded-lg hover:bg-black/20 ${ad.text_class || "text-white"}`} title={t("ca.delete")}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
