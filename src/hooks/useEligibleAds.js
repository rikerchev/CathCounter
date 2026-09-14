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

// Standard "rent this banner" placeholder shown in place of a real ad, for
// an admin-defined AdSlot (see AdminAdSlots.jsx) that has no advertiser
// yet. Reuses the same is_translation_key strings as adCache.js's own
// DEFAULT_ADS "advertise here" fallback, so the wording is consistent
// whether it comes from an actual slot or the generic offline fallback.
function makeSlotPlaceholderAd(slot) {
  return {
    id: `slot-placeholder-${slot.id}`,
    title: "ad.advertiseHereTitle",
    description: "ad.advertiseHereDesc",
    is_translation_key: true,
    link: `/advertise?slot=${slot.id}`,
    logo_url: null,
    bg_class: "bg-gradient-to-r from-emerald-600 to-teal-600",
    text_class: "text-white",
    banner_position: slot.banner_position || "top",
    banner_size: slot.banner_size || "normal",
    languages: "all",
    countries: "all",
  };
}

// Picks the best still-available AdSlot for this placement + banner
// position, preferring an exact-placement slot over a generic "all pages"
// one — same precedence rule as bucketAdsByPosition() uses for real ads.
// "Available" mirrors Advertise.jsx's own filter for what it still lets
// advertisers request: the admin hasn't explicitly hidden it.
function pickAvailableSlot(slots, placement, position) {
  const eligible = (slots || []).filter(
    (s) => s.is_available !== false && (s.banner_position || "top") === position
  );
  return (
    eligible.find((s) => s.placement === placement) ||
    eligible.find((s) => s.placement === "all" || !s.placement) ||
    null
  );
}

/**
 * useEligibleAds — shared by AdBanner.jsx (top banners) and
 * BottomAdBanner.jsx (bottom banners): fetches/caches/filters custom ads
 * exactly once per page, and returns them already split into
 * `{ top, bottom }` for the current page. Pulled out of AdBanner.jsx in
 * v2.46 so both banner groups read from one fetch instead of duplicating
 * the whole network/cache/country/language dance.
 *
 * v2.49 — an admin-created AdSlot (see AdminAdSlots.jsx) that has no
 * advertiser filling it yet is no longer invisible: whichever bucket
 * (top/bottom) has no real ad for this page falls back to a standard
 * "advertise here" placeholder built from a matching, still-available
 * slot, so an unrented placement always shows something inviting an
 * advertiser to rent it. A slot never displaces a real ad that's already
 * showing there — it only fills a bucket that would otherwise be empty.
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

    Promise.all([
      base44.entities.CustomAd.list("sort_order"),
      base44.entities.AdSlot.list(),
    ])
      .then(([customAds, adSlots]) => {
        // Cache every currently active, country- AND language-eligible ad
        // across ALL placements (not just this page's) so the next mount —
        // on any page — can render real ads straight from cache instead of
        // falling back to the generic defaults while it waits on the
        // network again.
        const allActive = (customAds || []).filter(
          (a) => a.is_active && a.status !== "pending_review" && matchesCountry(a) && matchesLanguage(a, lang)
        );
        cacheAds(allActive);

        let bucketed = bucketAdsByPosition(allActive, placement);
        for (const ad of [...bucketed.top, ...bucketed.bottom]) trackImpression(ad.id);

        // Backfill whichever bucket has no real ad with the standard
        // "advertise here" placeholder for a matching, still-available
        // AdSlot (v2.49) — a slot never displaces a real ad, it only fills
        // a gap that would otherwise be empty.
        for (const position of ["top", "bottom"]) {
          if (bucketed[position].length === 0) {
            const slot = pickAvailableSlot(adSlots, placement, position);
            if (slot) bucketed = { ...bucketed, [position]: [makeSlotPlaceholderAd(slot)] };
          }
        }

        if (bucketed.top.length > 0 || bucketed.bottom.length > 0) {
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
