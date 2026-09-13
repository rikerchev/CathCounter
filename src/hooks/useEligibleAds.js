import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  getCurrentAds,
  cacheAds,
  matchesLanguage,
  bucketAdsByPosition,
  trackImpression,
  getPendingImpressions,
  clearPendingImpressions,
} from "@/lib/adCache";
import { useLanguage } from "@/lib/i18n";
import { usePremium } from "@/hooks/usePremium";
import { base44 } from "@/api/base44Client";
import { detectCountry, getCachedCountry } from "@/lib/geo";

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

/**
 * useEligibleAds — shared by AdBanner.jsx (top banners) and
 * BottomAdBanner.jsx (bottom banners): fetches/caches/filters custom ads
 * exactly once per page, and returns them already split into
 * `{ top, bottom }` for the current page. Pulled out of AdBanner.jsx in
 * v2.46 so both banner groups read from one fetch instead of duplicating
 * the whole network/cache/country/language dance.
 */
export function useEligibleAds() {
  const { lang } = useLanguage();
  const { isPremium } = usePremium();
  const location = useLocation();
  const placement = PLACEMENT_MAP[location.pathname] || "all";

  const [ads, setAds] = useState(() => (isPremium ? { top: [], bottom: [] } : getCurrentAds(placement, lang)));
  const [userCountry, setUserCountry] = useState(getCachedCountry());

  useEffect(() => {
    if (isPremium) {
      setAds({ top: [], bottom: [] });
      return;
    }

    const country = getCachedCountry();
    const matchesCountry = (ad) => {
      if (!ad.countries || ad.countries === "all") return true;
      if (!country) return true; // no detection yet — show ad
      return ad.countries.split(",").map((c) => c.trim().toUpperCase()).includes(country);
    };

    // Show the best ads we already know about immediately (cache/defaults),
    // then upgrade once the network responds below — never leave either
    // banner group blank while waiting.
    setAds(getCurrentAds(placement, lang));

    base44.entities.CustomAd.list("sort_order")
      .then((customAds) => {
        // Cache every currently active, country- AND language-eligible ad
        // across ALL placements (not just this page's) so the next mount —
        // on any page — can render real ads straight from cache instead of
        // falling back to the generic defaults while it waits on the
        // network again.
        const allActive = (customAds || []).filter(
          (a) => a.is_active && a.status !== "pending_review" && matchesCountry(a) && matchesLanguage(a, lang)
        );
        cacheAds(allActive);

        const bucketed = bucketAdsByPosition(allActive, placement);
        if (bucketed.top.length > 0 || bucketed.bottom.length > 0) {
          for (const ad of [...bucketed.top, ...bucketed.bottom]) trackImpression(ad.id);
          setAds(bucketed);
        } else {
          setAds(getCurrentAds(placement, lang));
        }
      })
      .catch(() => {
        setAds(getCurrentAds(placement, lang));
      });

    if (!country) {
      detectCountry().then((code) => {
        if (code) setUserCountry(code);
      });
    }

    const handleOnline = () => {
      const pending = getPendingImpressions();
      if (pending.length > 0) {
        clearPendingImpressions();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isPremium, location.pathname, userCountry, lang]);

  if (isPremium) return { top: [], bottom: [], userCountry };
  return { ...ads, userCountry };
}
