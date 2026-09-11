import { useLanguage } from "@/lib/i18n";
import { getCurrentAd, getPendingImpressions, clearPendingImpressions } from "@/lib/adCache";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePremium } from "@/hooks/usePremium";
import { base44 } from "@/api/base44Client";
import { detectCountry, getCachedCountry } from "@/lib/geo";

const LOGO_SIZE_CLASSES = {
  "16x16": "w-16 h-16",
  "32x16": "w-32 h-16",
  "48x16": "w-48 h-16",
  "auto": "w-auto h-auto max-w-full max-h-24",
};

const PLACEMENT_MAP = {
  "/": "home",
  "/active-session": "session",
  "/log-catch": "log_catch",
  "/catch-history": "history",
  "/sessions": "sessions",
  "/statistics": "statistics",
  "/locations": "locations",
  "/personal-best": "personal_best",
  "/bait-inventory": "bait_inventory",
  "/water-bodies": "water_bodies",
  "/competitions": "competitions",
  "/sector-reservations": "sector_reservations",
  "/advertise": "advertise",
  "/profile": "profile",
};

export default function AdBanner() {
  const { t, lang } = useLanguage();
  const { isPremium } = usePremium();
  const [ad, setAd] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userCountry, setUserCountry] = useState(getCachedCountry());
  const location = useLocation();

  useEffect(() => {
    if (isPremium) return;

    const placement = PLACEMENT_MAP[location.pathname] || "all";
    const country = getCachedCountry();

    const matchesCountry = (ad) => {
      if (!ad.countries || ad.countries === "all") return true;
      if (!country) return true; // no detection yet — show ad
      return ad.countries.split(",").map((c) => c.trim().toUpperCase()).includes(country);
    };

    // Try custom ads first
    base44.entities.CustomAd.list("sort_order")
      .then((customAds) => {
        const active = (customAds || []).filter(
          (a) => a.is_active && a.status !== "pending_review" && (a.placement === "all" || a.placement === placement) && matchesCountry(a)
        );
        if (active.length > 0) {
          setAd(active[0]);
        } else {
          setAd(getCurrentAd(placement));
        }
      })
      .catch(() => {
        setAd(getCurrentAd(placement));
            });

    // Detect country for future ad loads
    if (!country) {
      detectCountry().then((code) => {
        if (code) setUserCountry(code);
      });
    }

    const handleOnline = () => {
      setIsOnline(true);
      const pending = getPendingImpressions();
      if (pending.length > 0) {
        clearPendingImpressions();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isPremium, location.pathname, userCountry]);

  if (isPremium || !ad) return null;

  // Resolve translation keys for default/fallback ads
  const resolveText = (text) => (ad.is_translation_key && text ? t(text) : text);
  let displayTitle = resolveText(ad.title);
  let displayDescription = resolveText(ad.description);
  let displayCta = resolveText(ad.cta);
  if (ad.country_content && userCountry) {
    try {
      const cc = JSON.parse(ad.country_content);
      const entry = cc[userCountry];
      if (entry) {
        if (entry.title) displayTitle = entry.title;
        if (entry.description) displayDescription = entry.description;
        if (entry.cta) displayCta = entry.cta;
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
        if (entry.cta) displayCta = entry.cta;
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return (
    <div className="sticky top-[61px] lg:top-0 z-20 bg-white/90 dark:bg-card/90 backdrop-blur-md border-b border-slate-100 dark:border-border">
      <div
        data-ad-region="fishing"
        data-ad-keywords="fishing tackle bait rods"
        className={`relative ${ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600"} rounded-md px-2 py-0.5 mx-2 my-0.5`}
      >
        <Link to={ad.link || "/advertise"} className="flex items-center gap-3 w-full">
          {ad.logo_url && (
            <div className={`${LOGO_SIZE_CLASSES[ad.logo_size] || LOGO_SIZE_CLASSES["auto"]} rounded-lg shrink-0 flex items-center justify-center`}>
              <img
                src={ad.logo_url}
                alt={displayTitle}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 text-center">
            <p className={`text-sm font-bold ${ad.text_class || "text-white"} truncate`}>
              {displayTitle}
            </p>
            {displayDescription && (
              <p className={`text-[11px] ${ad.text_class || "text-white"} opacity-90 truncate`}>
                {displayDescription}
              </p>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}