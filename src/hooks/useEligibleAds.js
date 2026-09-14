import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  getCurrentAds,
  cacheAds,
  getCachedSlots,
  cacheSlots,
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

// Fills whichever bucket (top/bottom) has no real ad with a slot
// placeholder, given a list of slots — shared by the synchronous
// (cache-only) initial render and the async (network-fresh) update below,
// so both apply the exact same rule. See adCache.js's cacheSlots() comment
// for why this needs to run on the synchronous path too, not just after
// the network responds.
function backfillWithSlots(bucketed, slots, placement) {
  let result = bucketed;
  for (const position of ["top", "bottom"]) {
    if (result[position].length === 0) {
      const slot = pickAvailableSlot(slots, placement, position);
      if (slot) result = { ...result, [position]: [makeSlotPlaceholderAd(slot)] };
    }
  }
  return result;
}

// Best-known state for this placement without touching the network: real
// ads from cache (or the built-in defaults, see adCache.js) plus, for
// whichever bucket is still empty, a slot placeholder from the last cached
// AdSlot list. This is what the hook renders on mount, before its effect
// below ever fires — see cacheSlots() in adCache.js for why.
function getInitialAds(placement, lang) {
  return backfillWithSlots(getCurrentAds(placement, lang), getCachedSlots(), placement);
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
 *
 * v2.53 — that placeholder used to only ever appear AFTER the network
 * fetch resolved (it was never cached), so on any page where the cached
 * ad list didn't already cover it, the banner popped in after the page was
 * already visible and pushed everything below it down — including the
 * "install the app" banner's own button, right as someone might be
 * tapping it. The AdSlot list is now cached the same way real ads already
 * were (see cacheSlots()/getCachedSlots() in adCache.js), so the very next
 * visit to that page renders the same placeholder immediately, with
 * nothing shifting afterwards.
 */
export function useEligibleAds() {
  const { lang } = useLanguage();
  const { isPremium } = usePremium();
  const location = useLocation();
  const placement = PLACEMENT_MAP[location.pathname] || "all";

  const [ads, setAds] = useState(() => (isPremium ? { top: [], bottom: [] } : getInitialAds(placement, lang)));
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

    // Show the best ads we already know about immediately (cache/defaults,
    // slot placeholder included), then upgrade once the network responds
    // below — never leave either banner group blank while waiting.
    setAds(getInitialAds(placement, lang));

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
        // v2.53 — cache the slot list too (see adCache.js), so the next
        // page load can render the same placeholder synchronously instead
        // of only after this network round-trip finishes.
        cacheSlots(adSlots);

        let bucketed = bucketAdsByPosition(allActive, placement);
        for (const ad of [...bucketed.top, ...bucketed.bottom]) trackImpression(ad.id);

        // Backfill whichever bucket has no real ad with the standard
        // "advertise here" placeholder for a matching, still-available
        // AdSlot (v2.49) — a slot never displaces a real ad, it only fills
        // a gap that would otherwise be empty.
        bucketed = backfillWithSlots(bucketed, adSlots, placement);

        if (bucketed.top.length > 0 || bucketed.bottom.length > 0) {
          setAds(bucketed);
        } else {
          setAds(getInitialAds(placement, lang));
        }
      })
      .catch(() => {
        setAds(getInitialAds(placement, lang));
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
