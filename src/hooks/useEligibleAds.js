import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  getCachedAds,
  cacheAds,
  getCachedSlots,
  cacheSlots,
  matchesLanguage,
  resolveZone,
  trackImpression,
  getPendingImpressions,
  clearPendingImpressions,
} from "@/lib/adCache";
import { useLanguage } from "@/lib/i18n";
import { usePremium } from "@/hooks/usePremium";
import { base44 } from "@/api/base44Client";
import { detectCountry, getCachedCountry } from "@/lib/geo";
import { useAdSenseInfo } from "@/hooks/useAdSenseInfo";

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

const EMPTY_ZONES = {
  top: { sourceType: "custom", adUnitId: null, adUnitLayoutKey: null, ads: [] },
  bottom: { sourceType: "custom", adUnitId: null, adUnitLayoutKey: null, ads: [] },
};

// Standard "rent this banner" placeholder shown in place of a real ad, for
// an admin-defined AdSlot (see AdManagement.jsx) that has no advertiser yet
// — never shown for a slot whose source_type is "adsense" (see buildZones()
// below), since that zone either has its ad unit configured or doesn't;
// there's no "unrented" state for it. Reuses the same is_translation_key
// strings as adCache.js's own DEFAULT_ADS "advertise here" fallback, so the
// wording is consistent whether it comes from an actual slot or the
// generic offline fallback.
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

// v3.30 — builds { top, bottom } zone objects (see adCache.js's
// resolveZone() for the shape) from whatever ads/slots are currently known
// (cache or fresh network). Backfills whichever custom/merchant zone ends
// up with no real ad with the standard "advertise here" placeholder for a
// matching, still-available slot — a slot never displaces a real ad, it
// only fills a gap that would otherwise be empty. Shared by the synchronous
// (cache-only) initial render and the async (network-fresh) update below,
// so both apply the exact same rule.
function buildZones(ads, slots, placement, lang) {
  const zones = {};
  for (const position of ["top", "bottom"]) {
    const zone = resolveZone(ads, slots, placement, position, lang);
    const needsPlaceholder = zone.sourceType !== "adsense" && zone.ads.length === 0 && zone.slot;
    zones[position] = needsPlaceholder ? { ...zone, ads: [makeSlotPlaceholderAd(zone.slot)] } : zone;
  }
  return zones;
}

// Best-known state for this placement without touching the network: real
// ads from cache (or the built-in defaults, see adCache.js) plus, for
// whichever zone is still empty, a slot placeholder from the last cached
// AdSlot list. This is what the hook renders on mount, before its effect
// below ever fires — see cacheSlots() in adCache.js for why.
function getInitialZones(placement, lang) {
  const ads = getCachedAds().filter((a) => matchesLanguage(a, lang));
  return buildZones(ads, getCachedSlots(), placement, lang);
}

/**
 * useEligibleAds — shared by AdBanner.jsx (top banners) and
 * BottomAdBanner.jsx (bottom banners): fetches/caches/filters custom ads
 * exactly once per page, and returns them already split into
 * `{ top, bottom }` for the current page. Pulled out of AdBanner.jsx in
 * v2.46 so both banner groups read from one fetch instead of duplicating
 * the whole network/cache/country/language dance.
 *
 * v3.30 — `top`/`bottom` are no longer plain ad arrays: each is now
 * `{ sourceType, adUnitId, ads }` (see adCache.js's resolveZone()) so a
 * consumer can tell whether this zone is a manual Google AdSense unit, a
 * partner-merchant banner, or the normal stack of own ads — see
 * AdBanner.jsx / BottomAdBanner.jsx for how each is rendered. Also exposes
 * `publisherId` (the account-wide AdSense client id, needed to actually
 * render an AdSense zone) and `eligibleMerchantKeys` (server-resolved,
 * per-ad list of currently-eligible attached merchants — see
 * AdBannerItem.jsx).
 *
 * v2.49 — an admin-created AdSlot that has no advertiser filling it yet is
 * no longer invisible: whichever zone (top/bottom) has no real ad for this
 * page falls back to a standard "advertise here" placeholder built from a
 * matching, still-available slot, so an unrented placement always shows
 * something inviting an advertiser to rent it. A slot never displaces a
 * real ad that's already showing there — it only fills a zone that would
 * otherwise be empty.
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
  const { publisherId } = useAdSenseInfo();

  const [zones, setZones] = useState(() => (isPremium ? EMPTY_ZONES : getInitialZones(placement, lang)));
  const [userCountry, setUserCountry] = useState(getCachedCountry());
  // v3.44 — server-resolved list of currently-ELIGIBLE attached merchants
  // per ad id (each entry "type:id"), for any ad with 1+ attached merchants
  // — see server/routes/merchantReferrals.ts's active-merchants endpoint.
  // Populated only after the network round-trip below; until then (or if it
  // fails), AdBannerItem.jsx treats the ad's merchants as not-yet-resolved
  // and shows only its manual_items (if any) until this arrives, so nothing
  // shows a merchant that later turns out to be ineligible.
  const [eligibleMerchantKeys, setEligibleMerchantKeys] = useState({});

  useEffect(() => {
    if (isPremium) {
      setZones(EMPTY_ZONES);
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
    // below — never leave either zone blank while waiting.
    setZones(getInitialZones(placement, lang));

    // Small stagger before the network upgrade — this hook runs on EVERY
    // page via the ad banner components, landing in the same instant as
    // that page's own primary data fetch and NotificationsBell's fetch.
    // Since a real ad or cached one is already showing (setZones above), a
    // brief delay here is invisible to the user but meaningfully lowers the
    // request burst that was overwhelming the DB's connection limit
    // (`max: 3` per serverless instance, see server/db.ts).
    const fetchId = setTimeout(() => {
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
        cacheSlots(adSlots);

        const newZones = buildZones(allActive, adSlots, placement, lang);
        for (const position of ["top", "bottom"]) {
          for (const ad of newZones[position].ads) trackImpression(ad.id);
        }

        const anyContent =
          newZones.top.ads.length > 0 || newZones.bottom.ads.length > 0 ||
          newZones.top.sourceType === "adsense" || newZones.bottom.sourceType === "adsense";
        setZones(anyContent ? newZones : getInitialZones(placement, lang));

        // v3.44 — resolve, server-side, which of each ad's attached
        // merchants are currently ELIGIBLE (had a QR-code referral within
        // the rolling window — see merchantReferrals.ts). Every ad with 1+
        // attached merchants is included now, not just 2+, since even a
        // single attached merchant needs to know whether it's eligible at
        // all (if not, the banner falls back to manual_items only).
        const merchantAds = [...newZones.top.ads, ...newZones.bottom.ads].filter((ad) => {
          if (!ad.merchants) return false;
          try {
            const list = JSON.parse(ad.merchants);
            return Array.isArray(list) && list.length >= 1;
          } catch {
            return false;
          }
        });
        if (merchantAds.length > 0) {
          const payload = merchantAds.map((ad) => {
            let list = [];
            try {
              list = JSON.parse(ad.merchants);
            } catch {
              list = [];
            }
            return {
              id: ad.id,
              merchants: list.map((m) => ({ type: m.type, id: m.id })),
            };
          });
          base44.merchantReferrals
            .activeMerchants(payload)
            .then((resolved) => setEligibleMerchantKeys(resolved || {}))
            .catch(() => {});
        }
      })
      .catch(() => {
        setZones(getInitialZones(placement, lang));
      });
    }, 400);

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
    return () => {
      clearTimeout(fetchId);
      window.removeEventListener("online", handleOnline);
    };
  }, [isPremium, location.pathname, userCountry, lang]);

  if (isPremium) return { ...EMPTY_ZONES, userCountry, publisherId, eligibleMerchantKeys: {} };
  return { ...zones, userCountry, publisherId, eligibleMerchantKeys };
}
