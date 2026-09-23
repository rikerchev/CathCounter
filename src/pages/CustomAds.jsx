import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { DEFAULT_LANGUAGES, getLanguageNativeName } from "@/lib/languages";
import { Plus, Trash2, Pencil, X, Eye, EyeOff, Upload, Loader2, Check, Globe, Languages, Store, Waves, ArrowUp, ArrowDown, Clock, RefreshCw } from "lucide-react";
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
import { rotationUiToSeconds, MERCHANT_TURN_SECONDS, findSlotForPosition, setLastAdSyncAt } from "@/lib/adCache";

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

// v3.26 — admin-assigned merchant banner. A banner can show one or more
// approved merchants (water_bodies/venues) instead of (or alongside, as of
// v3.44 — see manual_items below) a manually typed title/logo/link — see
// the `merchants` column comment in entities.generated.ts and
// src/components/AdBannerItem.jsx's carousel-building logic.
//
// v3.44 — the old admin-set rotation interval (merchant_rotation_minutes,
// rotationMinutesToUi/rotationUiToMinutes, ROTATION_UNIT_KEYS) is RETIRED:
// eligible merchants now always get the same flat MERCHANT_TURN_SECONDS
// turn (see adCache.js), and rotate live via a real client-side timer
// instead of a fixed admin-chosen interval — see the "Ръчно въведени
// реклами в банера" section below and AdBannerItem.jsx.

// v3.30 — a second, INDEPENDENT rotation concept from the one above: this
// one rotates DIFFERENT custom_ads rows sharing one exact placement+
// position slot, instead of merchant snapshots within a single row. An ad
// opts in by turning this on; two or more opted-in ads on the same slot
// then take turns instead of stacking, each shown for its own configured
// number of seconds (stored in rotation_seconds) in a repeating cycle. See
// src/lib/adCache.js's applyCustomAdRotation(). Unrelated to, and untouched
// by, the v3.44 merchant-banner live carousel above.
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

// rotationUiToSeconds() itself now lives in @/lib/adCache — imported above
// — so AdBannerItem.jsx can also share it for the manual-items duration
// (previously it was a page-local helper here only).

function newManualItemId() {
  return `mi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// v3.45 — same normalization CommercialVenues.jsx already applies when it
// renders a venue's plain `website` field as an outbound link: that field
// is filled in without a required protocol (placeholder is just
// "https://"), unlike `ad_link`/a custom ad's own `link`, which have always
// been treated as complete, ready-to-navigate values. Only applied to the
// `website` fallback below — never to `ad_link` itself.
function normalizeMerchantUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
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
  // v3.44 — snapshots also carry `description`/`link`, taken from the
  // merchant's own venues.ad_description/ad_link at attach time.
  merchants: [],
  // v3.44 — array of manually-entered carousel items ({id, title,
  // description, link, logo_url, logo_size, duration_value, duration_unit}
  // in FORM/UI shape — see startEdit()/save() for the conversion to/from
  // the saved {..., duration_seconds} shape). A companion to `merchants`
  // within the same banner: always shown alongside whichever merchants are
  // currently eligible, and the only thing shown when none are. See
  // AdBannerItem.jsx's live carousel.
  manual_items: [],
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
  // v3.45 — no longer edited from the UI (the per-language translate flow
  // below was removed), but still loaded/round-tripped on save so an older
  // ad's existing per-language overrides aren't silently wiped out.
  const [languageContent, setLanguageContent] = useState({});
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [targetAllCountries, setTargetAllCountries] = useState(true);
  // v3.45 — replaces the old `languageRestricted` + auto-translate flow.
  // A plain, single-purpose filter now — which languages this banner shows
  // for at all (same idea and same UI pattern as `targetAllCountries`
  // above) — no more bundled "translate the copy for this language" step;
  // the ad's title/description stay the same text for every language it's
  // shown to. true (default) = shown to everyone, `selectedLanguages` is
  // then just an unused list; false = shown only to the codes in
  // `selectedLanguages`.
  const [targetAllLanguages, setTargetAllLanguages] = useState(true);
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
  // admin-only action).
  const [approvedMerchants, setApprovedMerchants] = useState([]);
  // v3.56 — which attached-merchant row (by index) is currently being
  // re-fetched from the server via refreshMerchant() below.
  const [refreshingMerchantIndex, setRefreshingMerchantIndex] = useState(null);
  // v3.44 — which manual_items row (by index) currently has a logo upload
  // in flight, if any — each row needs its own busy indicator, unlike the
  // single `uploadingLogo` flag below (which only ever covers the ad's own
  // one logo field).
  const [uploadingManualLogoIndex, setUploadingManualLogoIndex] = useState(null);
  // v3.30 — UI-only state for form.rotation_seconds (see
  // rotationSecondsToUi/rotationUiToSeconds above) — whether THIS ad takes
  // turns with other ads sharing its exact placement+position, and for how
  // long each turn lasts.
  const [rotationDisplayEnabled, setRotationDisplayEnabled] = useState(false);
  const [rotationDisplayValue, setRotationDisplayValue] = useState("10");
  const [rotationDisplayUnit, setRotationDisplayUnit] = useState("seconds");
  // v3.45 — UI-only value+unit pair for form's new own_content_duration_seconds
  // column: how long THIS ad's own title/description/link/logo stays on
  // screen within its own internal carousel, now that it's no longer
  // replaced by an attached merchant but simply joins the rotation as one
  // more item (see AdBannerItem.jsx's buildCarouselItems()). Deliberately a
  // separate field from `rotation_seconds` above, which stays exactly what
  // it always was — the unrelated cross-ROW rotation between different
  // custom_ads sharing one placement+position.
  const [ownContentDurationValue, setOwnContentDurationValue] = useState("10");
  const [ownContentDurationUnit, setOwnContentDurationUnit] = useState("seconds");
  // v3.56 — "never show this ad's own content, only currently-eligible
  // merchants/manual items" — own_content_duration_seconds = 0 exactly (not
  // just "small"). rotationUiToSeconds() (adCache.js) clamps to a minimum
  // of 1 by design (a manual item or cross-row rotation_seconds of 0 would
  // never show or divide-by-zero the rotation math), so 0 can only ever
  // reach the saved payload through this separate checkbox, never through
  // the number input below. See buildCarouselItems()/AdBannerItem.jsx for
  // how 0 is then treated as "skip entirely", not "use the default".
  const [hideOwnContent, setHideOwnContent] = useState(false);

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
    // v3.44 — manual_items are stored with a plain `duration_seconds`; the
    // form/UI works in the same friendly value+unit pair the ad-level
    // rotation_seconds field already uses (rotationSecondsToUi below).
    let parsedManualItems = [];
    try {
      const rawManual = ad.manual_items ? JSON.parse(ad.manual_items) : [];
      if (Array.isArray(rawManual)) {
        parsedManualItems = rawManual.map((item) => {
          const dUi = rotationSecondsToUi(item?.duration_seconds);
          return {
            id: item?.id || newManualItemId(),
            title: item?.title || "",
            description: item?.description || "",
            link: item?.link || "",
            logo_url: item?.logo_url || "",
            logo_size: item?.logo_size || "auto",
            duration_value: dUi.value,
            duration_unit: dUi.unit,
          };
        });
      }
    } catch {
      parsedManualItems = [];
    }
    const rotDisplayUi = rotationSecondsToUi(ad.rotation_seconds);
    setRotationDisplayEnabled(Number(ad.rotation_seconds) > 0);
    setRotationDisplayValue(rotDisplayUi.value);
    setRotationDisplayUnit(rotDisplayUi.unit);
    const ownDurationUi = rotationSecondsToUi(ad.own_content_duration_seconds);
    setOwnContentDurationValue(ownDurationUi.value);
    setOwnContentDurationUnit(ownDurationUi.unit);
    setHideOwnContent(Number(ad.own_content_duration_seconds) === 0);
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
      manual_items: parsedManualItems,
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
    const isAllLanguages = languages === "all";
    const languageCodes = isAllLanguages ? [] : languages.split(",").map((c) => c.trim()).filter(Boolean);
    setTargetAllLanguages(isAllLanguages);
    setSelectedLanguages(languageCodes);
    // Preserved as-is (round-tripped on save) even though the UI no longer
    // edits it — see the languageContent useState comment above.
    setLanguageContent(parsedLangContent);
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
    setTargetAllLanguages(true);
    setEditingOriginalPeriod(null);
    setUploadingManualLogoIndex(null);
    setRotationDisplayEnabled(false);
    setRotationDisplayValue("10");
    setRotationDisplayUnit("seconds");
    setOwnContentDurationValue("10");
    setOwnContentDurationUnit("seconds");
    setHideOwnContent(false);
  }

  // v3.45 — plain add/remove toggle for the simple language filter (no
  // longer bundled with translation — see targetAllLanguages above).
  function toggleLanguage(code) {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  // v3.26 — add/remove/reorder merchants attached to this banner. Each
  // entry is a denormalized SNAPSHOT taken at attach time (name/logo/
  // logo_size, and as of v3.44 also description/link), not a live
  // reference — see the `merchants` column comment in
  // entities.generated.ts for why.
  // v3.45 — link falls back to the venue's general `website` (v2.71,
  // normalized above) whenever the venue has no dedicated `ad_link` (v3.44)
  // of its own — a venue owner who only ever filled in "Website" under
  // Търговски обекти still gets their real site carried over here, instead
  // of the banner falling back to something unrelated (the FIX for that:
  // see AdBannerItem.jsx's buildCarouselItems(), which no longer falls
  // back to the ad's OWN link when a merchant snapshot has none of its
  // own). `water_body`-type merchants have no `website` field at all (only
  // venues do — see the v3.44 doc's own scope note), so this fallback is a
  // no-op for those; their snapshot's `link` stays "" if `ad_link` is unset.
  function snapshotMerchant(mtype, merchant) {
    return {
      type: mtype,
      id: merchant.id,
      name: merchant.name || "",
      logo_url: merchant.logo_url || "",
      logo_size: merchant.logo_size || "auto",
      description: merchant.ad_description || "",
      link: merchant.ad_link || normalizeMerchantUrl(merchant.website) || "",
    };
  }

  function addMerchant(key) {
    if (!key) return;
    const [mtype, mid] = key.split(":");
    const merchant = approvedMerchants.find((m) => m._type === mtype && m.id === mid);
    if (!merchant) return;
    setForm((prev) => ({
      ...prev,
      merchants: [...(prev.merchants || []), snapshotMerchant(mtype, merchant)],
    }));
  }

  function removeMerchant(index) {
    setForm((prev) => ({ ...prev, merchants: (prev.merchants || []).filter((_, i) => i !== index) }));
  }

  // v3.45 — a merchant's attached snapshot is frozen at attach time (see
  // snapshotMerchant() above and the `merchants` column comment in
  // entities.generated.ts) — it does NOT automatically pick up a link/
  // description/logo the merchant adds or edits afterwards.
  //
  // v3.56 fix — this used to look the merchant up in `approvedMerchants`,
  // which is fetched ONCE when the page/component mounts (see the
  // useEffect above). If the merchant's own record was edited (e.g. its
  // logo_size) AFTER this page was already open — a perfectly normal
  // scenario, since an admin often keeps this tab open in the background —
  // "Опресни" was silently reapplying that same stale in-memory copy: it
  // looked like nothing happened because, from this component's point of
  // view, nothing HAD changed. Now it fetches that one merchant's row
  // directly from the server (the same GET /api/entities/:name/:id every
  // entity read goes through) at the moment of the click, so it always
  // reflects whatever is actually saved right now.
  const ENTITY_BY_MERCHANT_TYPE = { water_body: "WaterBody", venue: "Venue" };
  async function refreshMerchant(index) {
    const entry = (form.merchants || [])[index];
    if (!entry) return;
    const entityName = ENTITY_BY_MERCHANT_TYPE[entry.type];
    if (!entityName) return;
    setRefreshingMerchantIndex(index);
    try {
      const merchant = await base44.entities[entityName].get(entry.id);
      if (!merchant) {
        toast({ title: t("common.couldNotLoad"), variant: "destructive" });
        return;
      }
      setForm((prev) => {
        const arr = [...(prev.merchants || [])];
        if (!arr[index]) return prev;
        arr[index] = snapshotMerchant(entry.type, merchant);
        return { ...prev, merchants: arr };
      });
      // Keep the mount-time cache in sync too, so the "add merchant"
      // dropdown and any other refresh in this session also see the
      // fresh data instead of racing back to the old snapshot.
      setApprovedMerchants((prev) =>
        prev.map((m) => (m._type === entry.type && m.id === entry.id ? { ...merchant, _type: entry.type } : m))
      );
      toast({ title: t("ca.merchantRefreshed") });
    } catch (e) {
      toast({ title: t("common.couldNotLoad"), description: e.message, variant: "destructive" });
    } finally {
      setRefreshingMerchantIndex(null);
    }
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

  // v3.44 — add/remove/reorder/edit manually-entered carousel items, the
  // companion to attached merchants within the same banner (see
  // manual_items comment on emptyAd above). Unlike merchants, these carry
  // their own full content (title/description/link/logo) typed directly by
  // the admin, plus their own per-item duration.
  function addManualItem() {
    setForm((prev) => ({
      ...prev,
      manual_items: [
        ...(prev.manual_items || []),
        {
          id: newManualItemId(),
          title: "",
          description: "",
          link: "",
          logo_url: "",
          logo_size: "auto",
          duration_value: "10",
          duration_unit: "seconds",
        },
      ],
    }));
  }

  function removeManualItem(index) {
    setForm((prev) => ({ ...prev, manual_items: (prev.manual_items || []).filter((_, i) => i !== index) }));
  }

  function updateManualItem(index, patch) {
    setForm((prev) => {
      const arr = [...(prev.manual_items || [])];
      if (!arr[index]) return prev;
      arr[index] = { ...arr[index], ...patch };
      return { ...prev, manual_items: arr };
    });
  }

  function moveManualItem(index, dir) {
    setForm((prev) => {
      const arr = [...(prev.manual_items || [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...prev, manual_items: arr };
    });
  }

  const toggleCountry = (code) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  async function save() {
    const hasMerchants = (form.merchants || []).length > 0;
    const hasManualItems = (form.manual_items || []).length > 0;
    // v3.45 — an ad's own title/description/link are required UNLESS
    // there's already other content that will show on the banner (an
    // attached merchant and/or a manual item) — the base fields are never
    // auto-filled/replaced any more (see AdBannerItem.jsx), so if none of
    // the three sources has content, the banner would otherwise be blank.
    if (!hasMerchants && !hasManualItems && (!form.title || !form.description || !form.link)) {
      toast({ title: t("adv.fillAllFields") });
      return;
    }
    if (!targetAllLanguages && selectedLanguages.length === 0) {
      toast({ title: t("ca.noLanguagesSelected") });
      return;
    }
    const languagesToSave = targetAllLanguages ? "all" : selectedLanguages.join(",");
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
        // v3.45 — the ad's own title is always just what's typed now (never
        // silently replaced) — but if the admin left it blank because a
        // merchant/manual item will carry the banner, fall back to one of
        // theirs here so the admin LIST (and anything else that still
        // reads ad.title directly) has something reasonable to show;
        // AdBannerItem.jsx's own carousel never reads this fallback, only
        // form.title's real value (via ad.title in buildCarouselItems).
        title: form.title || form.merchants[0]?.name || form.manual_items[0]?.title || "",
        countries,
        languages: languagesToSave,
        country_content: JSON.stringify(countryContent),
        language_content: JSON.stringify(languageContent),
        advertiser_email: form.advertiser_email || null,
        starts_at: form.starts_at || null,
        duration_months: form.duration_months ? Number(form.duration_months) : null,
        expires_at: expiresAt,
        merchants: JSON.stringify(form.merchants || []),
        // v3.44 — merchant_rotation_minutes is intentionally no longer sent
        // at all (RETIRED — see entities.generated.ts): eligible merchants
        // all get the same flat MERCHANT_TURN_SECONDS turn now, live, on
        // the client — see AdBannerItem.jsx — so there's no admin-set
        // interval to save any more. Blank rows (no title typed) are
        // dropped rather than saved, same as leaving a draft unfinished.
        manual_items: JSON.stringify(
          (form.manual_items || [])
            .filter((item) => (item.title || "").trim())
            .map((item) => ({
              id: item.id,
              title: item.title.trim(),
              description: item.description || "",
              link: item.link || "",
              logo_url: item.logo_url || "",
              logo_size: item.logo_size || "auto",
              duration_seconds: rotationUiToSeconds(item.duration_value, item.duration_unit),
            }))
        ),
        // v3.30 — this ad opts into taking turns with other ads sharing its
        // exact placement+position (see applyCustomAdRotation() in
        // adCache.js) for this many seconds per turn. null = keeps stacking
        // as before (default, unchanged behavior). Unrelated to the field
        // right below — this one rotates separate custom_ads ROWS against
        // each other; own_content_duration_seconds rotates WITHIN one row.
        rotation_seconds: rotationDisplayEnabled
          ? rotationUiToSeconds(rotationDisplayValue, rotationDisplayUnit)
          : null,
        // v3.45 — how long this ad's OWN content (title/description/link/
        // logo) stays on screen each time its turn comes up in the
        // internal carousel with its merchants/manual items (see
        // AdBannerItem.jsx's buildCarouselItems()). Only meaningful — and
        // only saved — once there's actually something else to rotate
        // with; otherwise the own content just renders statically and this
        // stays null.
        // v3.56 — hideOwnContent forces exactly 0, bypassing
        // rotationUiToSeconds() (which clamps to a minimum of 1 and could
        // never produce 0 on its own). AdBannerItem.jsx treats 0 as
        // "never show the ad's own content — cycle only through eligible
        // merchants/manual items", distinct from null/unset (own content
        // shown normally) and from a positive value (shown for that long).
        own_content_duration_seconds: hasCarousel
          ? hideOwnContent
            ? 0
            : rotationUiToSeconds(ownContentDurationValue, ownContentDurationUnit)
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

        // v3.45 — an admin assigning this ad to an exact placement+position
        // that's currently configured as a Google AdSense slot means that
        // slot is no longer AdSense's to fill — switch it to "custom" so
        // this ad (and any others sharing the bucket) actually shows there,
        // instead of silently losing to an AdSense unit nobody sees this
        // change conflicts with. Admin-only and best-effort: a non-admin's
        // submission goes to pending review first and must never touch
        // slot config before an admin has even looked at it, and a failure
        // here doesn't roll back the ad save that already succeeded above.
        if (isAdmin) {
          try {
            const slots = await base44.entities.AdSlot.list();
            const slot = findSlotForPosition(slots, payload.placement, payload.banner_position || "top");
            if (slot && slot.source_type === "adsense") {
              await base44.entities.AdSlot.update(slot.id, { source_type: "custom" });
              toast({ title: t("ca.adSenseAutoSwitched").replace("{slot}", slot.name || slot.placement) });
            }
          } catch {
            // non-fatal — the ad itself already saved fine above
          }
        }

        // v3.56 — this ad's content just changed, but the visitor-facing
        // banner (useEligibleAds.js) reads from a local ad cache that only
        // actually re-syncs with the server at most once every
        // AD_SYNC_INTERVAL_MS (10 minutes — see adCache.js), to avoid
        // waking a phone's radio on every page navigation for nothing.
        // That's the right trade-off for an ordinary visitor, but it also
        // meant an admin testing a change right after saving it — on the
        // very same browser/device this admin panel is open in — could
        // keep seeing the OLD ad for up to 10 more minutes and reasonably
        // conclude the save "had no effect" (reported after the v3.56
        // hideOwnContent toggle: the value was correctly saved server-side
        // the whole time, only this device's own cached copy was stale).
        // Resetting the throttle here makes the NEXT sync on THIS device
        // (e.g. opening /active-session right after saving) happen
        // immediately instead of waiting out the window — it does not
        // affect any other visitor's device, so the battery/data saving
        // this throttle exists for is untouched everywhere else.
        setLastAdSyncAt(0);
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
       setLastAdSyncAt(0);
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
       setLastAdSyncAt(0);
       await loadAds();
      } catch (e) {
       toast({ title: t("awb.error"), description: e.message });
      }
      }

      async function toggleActive(ad) {
      const activating = !ad.is_active;
      try {
       await base44.entities.CustomAd.update(ad.id, { is_active: activating });
       setLastAdSyncAt(0);
       await loadAds();
      } catch (e) {
       toast({ title: t("awb.error"), description: e.message });
    }
  }

  const hasMerchants = (form.merchants || []).length > 0;
  // v3.45 — manual items and the ad's own content now form the internal
  // carousel together with any merchants, so several UI bits below (the
  // own-content duration field, the manual-items section itself) need to
  // key off "is there anything else to rotate with" rather than only
  // "are there merchants" as before.
  const hasManualItems = (form.manual_items || []).length > 0;
  const hasCarousel = hasMerchants || hasManualItems;

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

            {/* v3.45 — once this ad has 1+ merchants and/or manual items
                attached, its own content above stops being static and
                becomes one more item in the same live carousel
                (AdBannerItem.jsx) — this sets how long it stays on screen
                each time its turn comes up, independent of the
                merchants' flat 10s turn and of each manual item's own
                duration below. */}
            {hasCarousel && (
              <div className="space-y-2">
                {/* v3.56 — lets this ad's own branding be hidden from the
                    carousel entirely, leaving only currently-eligible
                    merchants/manual items to cycle through. Saved as
                    own_content_duration_seconds = 0 (see save payload
                    above and buildCarouselItems() in AdBannerItem.jsx),
                    which is otherwise unreachable through the number
                    input below (rotationUiToSeconds() always clamps to
                    a minimum of 1). */}
                <div className="flex items-center gap-2">
                  <EyeOff className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <Label className="mb-0">{t("ca.hideOwnContent")}</Label>
                  <Switch
                    checked={hideOwnContent}
                    onCheckedChange={setHideOwnContent}
                    className="ml-auto"
                  />
                </div>
                <p className="text-xs text-slate-400">{t("ca.hideOwnContentHint")}</p>
                {!hideOwnContent && (
                  <div>
                    <Label>{t("ca.ownContentDuration")}</Label>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <Input
                        type="number"
                        min="1"
                        value={ownContentDurationValue}
                        onChange={(e) => setOwnContentDurationValue(e.target.value)}
                        className="min-h-[44px]"
                      />
                      <Select value={ownContentDurationUnit} onValueChange={setOwnContentDurationUnit}>
                        <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROTATION_DISPLAY_UNITS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-slate-400">{t("ca.ownContentDurationHint")}</p>
                  </div>
                )}
              </div>
            )}

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
                            onClick={() => refreshMerchant(idx)}
                            disabled={refreshingMerchantIndex === idx}
                            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent disabled:opacity-50"
                            title={t("ca.refreshMerchant")}
                          >
                            {refreshingMerchantIndex === idx ? (
                              <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </button>
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

                {hasMerchants && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("ca.merchantsAutoNote").replace("{seconds}", String(MERCHANT_TURN_SECONDS))}
                  </p>
                )}

                {/* v3.44 — manual items: a companion "second ad" on the
                    same banner, typed directly instead of pulled from a
                    merchant — shown alongside whichever merchants above are
                    currently eligible, or entirely on its own if none are
                    attached at all (see AdBannerItem.jsx). v3.45 — no
                    longer gated on having a merchant attached first: manual
                    items now stand fully on their own. */}
                {(
                  <div className="pt-3 border-t border-slate-100 dark:border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-foreground">
                        {t("ca.manualItemsSection")}
                      </h4>
                      <Button type="button" size="sm" variant="outline" onClick={addManualItem}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> {t("ca.addManualItem")}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400">{t("ca.manualItemsHint")}</p>

                    {(form.manual_items || []).map((item, idx) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-200 dark:border-border p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
                            {t("ca.manualItemLabel")} {idx + 1}
                          </p>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveManualItem(idx, -1)}
                              disabled={idx === 0}
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent disabled:opacity-30"
                              title={t("ca.moveUp")}
                            >
                              <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveManualItem(idx, 1)}
                              disabled={idx === (form.manual_items || []).length - 1}
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent disabled:opacity-30"
                              title={t("ca.moveDown")}
                            >
                              <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeManualItem(idx)}
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-accent"
                              title={t("ca.removeMerchant")}
                            >
                              <X className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                          </div>
                        </div>

                        <Input
                          value={item.title}
                          onChange={(e) => updateManualItem(idx, { title: e.target.value })}
                          placeholder={t("ca.adTitle")}
                          className="min-h-[44px]"
                        />
                        <Input
                          value={item.description}
                          onChange={(e) => updateManualItem(idx, { description: e.target.value })}
                          placeholder={t("ca.adDescription")}
                          className="min-h-[44px]"
                        />
                        <Input
                          value={item.link}
                          onChange={(e) => updateManualItem(idx, { link: e.target.value })}
                          placeholder={t("ca.linkPlaceholder")}
                          className="min-h-[44px]"
                        />

                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 dark:bg-card dark:border-border flex items-center justify-center overflow-hidden shrink-0">
                            {item.logo_url ? (
                              <img src={item.logo_url} alt={t("ca.logoAlt")} className="w-full h-full object-contain p-1" />
                            ) : (
                              <Upload className="w-4 h-4 text-slate-300" />
                            )}
                          </div>
                          <label className="flex-1 cursor-pointer">
                            <span className="inline-flex items-center justify-center gap-2 min-h-[40px] w-full rounded-md border border-input bg-transparent text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                              {uploadingManualLogoIndex === idx ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("adv.uploading")}</>
                              ) : (
                                <><Upload className="w-3.5 h-3.5" /> {item.logo_url ? t("ca.changeLogo") : t("adv.uploadLogo")}</>
                              )}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingManualLogoIndex !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingManualLogoIndex(idx);
                                try {
                                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                  updateManualItem(idx, { logo_url: file_url });
                                  toast({ title: t("adv.logoUploaded") });
                                } catch (err) {
                                  toast({ title: t("adv.uploadError"), description: err.message });
                                } finally {
                                  setUploadingManualLogoIndex(null);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                          {item.logo_url && (
                            <button
                              type="button"
                              onClick={() => updateManualItem(idx, { logo_url: "" })}
                              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-accent"
                              title={t("ca.removeLogo")}
                            >
                              <X className="w-4 h-4 text-slate-500" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Select
                            value={item.logo_size}
                            onValueChange={(v) => updateManualItem(idx, { logo_size: v })}
                          >
                            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LOGO_SIZES.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                            <Input
                              type="number"
                              min="1"
                              value={item.duration_value}
                              onChange={(e) => updateManualItem(idx, { duration_value: e.target.value })}
                              className="min-h-[40px]"
                            />
                            <Select
                              value={item.duration_unit}
                              onValueChange={(v) => updateManualItem(idx, { duration_unit: v })}
                            >
                              <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ROTATION_DISPLAY_UNITS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400">{t("ca.manualItemDurationHint")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* v3.45 — plain language filter, replacing the old
                auto-translate-bundled "Languages" section entirely: no
                translation happens here any more, this only decides WHICH
                menu languages this ad is eligible to show in — and it's
                shown BEFORE "Покажи на" below on purpose, since the admin
                picks the language first, then which placement/menu (see
                ca.showOn below) to put this ad's language-filtered version
                into. */}
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("ca.languagesSection")}</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={targetAllLanguages}
                  onChange={(e) => setTargetAllLanguages(e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-600"
                />
                <span className="text-sm text-slate-600 dark:text-muted-foreground">{t("ca.allLanguagesTarget")}</span>
              </label>
              {!targetAllLanguages && (
                <>
                  <p className="text-xs text-slate-400">{t("ca.languagesFilterDesc")}</p>
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {DEFAULT_LANGUAGES.map((l) => {
                      const checked = selectedLanguages.includes(l.code);
                      return (
                        <label key={l.code} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLanguage(l.code)}
                            className="w-4 h-4 rounded accent-cyan-600"
                          />
                          <span className="text-sm text-slate-600 dark:text-muted-foreground flex-1 min-w-0 truncate">
                            {l.native_name || l.name} ({l.code})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
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