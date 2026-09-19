import { useLanguage } from "@/lib/i18n";
import { Link } from "react-router-dom";

const LOGO_SIZE_CLASSES = {
  "16x16": "w-16 h-16",
  "32x16": "w-32 h-16",
  "48x16": "w-48 h-16",
  auto: "w-auto h-auto max-w-full max-h-24",
};

// Padding/text scale per `banner_size` — "normal" matches the original,
// single-size look this app always had; "compact"/"large" are new in v2.46.
const SIZE_CLASSES = {
  compact: { wrap: "px-2 py-0", title: "text-xs", desc: "text-[10px]", logo: "w-10 h-10" },
  normal: { wrap: "px-2 py-0.5", title: "text-sm", desc: "text-[11px]", logo: "w-12 h-12" },
  large: { wrap: "px-3 py-2", title: "text-base", desc: "text-xs", logo: "w-16 h-16" },
};

// Where a resolved merchant's own listing lives — clicking the banner while
// it's showing a merchant goes to that merchant TYPE's public browse page,
// not a per-merchant deep link (admin's choice, v3.26).
const MERCHANT_LINK_BY_TYPE = {
  water_body: "/water-bodies",
  venue: "/commercial-venues",
};

/**
 * v3.26 — resolves which attached merchant (if any) this banner should show
 * right now. `ad.merchants` is a JSON array of denormalized snapshots
 * ([{type, id, name, logo_url, logo_size}, ...]) an admin attached in
 * CustomAds.jsx's "Търговци в банера" section — not a live join, so this
 * never needs a fetch. A single merchant always shows; two or more rotate
 * on `ad.merchant_rotation_minutes` using the current wall-clock time, so
 * every viewer sees the same one at the same instant (re-resolved on
 * mount/navigation only — no live ticking timer). Returns null when the ad
 * has no merchants, meaning "render the ad's own fields as before".
 */
function resolveActiveMerchant(ad) {
  if (!ad?.merchants) return null;
  let list;
  try {
    list = JSON.parse(ad.merchants);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  if (list.length === 1) return list[0];
  const minutes = Number(ad.merchant_rotation_minutes) > 0 ? Number(ad.merchant_rotation_minutes) : 30;
  const idx = Math.floor(Date.now() / (minutes * 60000)) % list.length;
  return list[idx];
}

/**
 * AdBannerItem — renders a single ad's own visual bar (color, logo, title,
 * description, link). Shared by AdBanner.jsx (top stack) and
 * BottomAdBanner.jsx (bottom stack), which each just decide layout/stacking
 * and hand one `ad` at a time to this component. Pulled out of AdBanner.jsx
 * in v2.46 when banners stopped being one-per-page.
 */
export default function AdBannerItem({ ad, userCountry }) {
  const { t, lang } = useLanguage();
  if (!ad) return null;

  const size = SIZE_CLASSES[ad.banner_size] || SIZE_CLASSES.normal;

  // v3.26 — if this banner has one or more merchants attached, it shows
  // that merchant's own logo + name (rotating between them if there's more
  // than one) instead of the ad's own manually-entered fields below —
  // country/language text overrides don't apply here (admin's choice: just
  // the merchant's logo + name, automatically).
  const activeMerchant = resolveActiveMerchant(ad);

  // Resolve translation keys for default/fallback ads
  const resolveText = (text) => (ad.is_translation_key && text ? t(text) : text);
  let displayTitle = resolveText(ad.title);
  let displayDescription = resolveText(ad.description);
  if (ad.country_content && userCountry) {
    try {
      const cc = JSON.parse(ad.country_content);
      const entry = cc[userCountry];
      if (entry) {
        if (entry.title) displayTitle = entry.title;
        if (entry.description) displayDescription = entry.description;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  // Resolve per-language overrides (takes priority over country)
  if (ad.language_content) {
    try {
      const lc = JSON.parse(ad.language_content);
      const entry = lc[lang];
      if (entry) {
        if (entry.title) displayTitle = entry.title;
        if (entry.description) displayDescription = entry.description;
      }
    } catch {
      // ignore malformed JSON
    }
  }

  let displayLogoUrl = ad.logo_url;
  let displayLogoSize = ad.logo_size;
  let displayLink = ad.link || "/advertise";
  if (activeMerchant) {
    displayTitle = activeMerchant.name || displayTitle;
    displayDescription = "";
    displayLogoUrl = activeMerchant.logo_url || "";
    displayLogoSize = activeMerchant.logo_size || "auto";
    displayLink = MERCHANT_LINK_BY_TYPE[activeMerchant.type] || displayLink;
  }

  return (
    <div
      data-ad-region="fishing"
      data-ad-keywords="fishing tackle bait rods"
      className={`relative ${ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600"} rounded-md ${size.wrap} mx-2 my-0.5`}
    >
      <Link to={displayLink} className="flex items-center gap-3 w-full">
        {displayLogoUrl && (
          <div className={`${LOGO_SIZE_CLASSES[displayLogoSize] || size.logo} rounded-lg shrink-0 flex items-center justify-center`}>
            <img src={displayLogoUrl} alt={displayTitle} className="w-full h-full object-contain" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-center">
          <p className={`${size.title} font-bold ${ad.text_class || "text-white"} truncate`}>
            {displayTitle}
          </p>
          {displayDescription && (
            <p className={`${size.desc} ${ad.text_class || "text-white"} opacity-90 truncate`}>
              {displayDescription}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
