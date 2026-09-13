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

  return (
    <div
      data-ad-region="fishing"
      data-ad-keywords="fishing tackle bait rods"
      className={`relative ${ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600"} rounded-md ${size.wrap} mx-2 my-0.5`}
    >
      <Link to={ad.link || "/advertise"} className="flex items-center gap-3 w-full">
        {ad.logo_url && (
          <div className={`${LOGO_SIZE_CLASSES[ad.logo_size] || size.logo} rounded-lg shrink-0 flex items-center justify-center`}>
            <img src={ad.logo_url} alt={displayTitle} className="w-full h-full object-contain" />
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
