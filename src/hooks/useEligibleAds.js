import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  getCachedAds,
  cacheAds,
  getCachedSlots,
  cacheSlots,
  getCachedEligibleMerchants,
  cacheEligibleMerchants,
  getLastAdSyncAt,
  setLastAdSyncAt,
  AD_SYNC_INTERVAL_MS,
  preloadAdImages,
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
 *
 * v3.48 — the caching/preloading pass inside this hook's effect (see
 * syncFromNetwork() below) is now explicitly a "warm the whole cache while
 * online" step: it caches every active, country-eligible ad across every
 * placement AND every language, and preloads every one of their logos
 * (including attached merchants' and manual items' — see
 * adCache.js's preloadAdImages()), not just today's current page/language.
 * Since this hook already mounts globally, on every route, via
 * AdBanner.jsx/BottomAdBanner.jsx living in Layout.jsx (not per-page), this
 * first sync effectively happens once at app startup (whenever the device
 * is online then) and again at most every AD_SYNC_INTERVAL_MS afterwards —
 * exactly the "cache everything up front while online, so offline still
 * has it everywhere" behaviour that was asked for. What actually RENDERS
 * right now is still narrowed to the visitor's current language, same as
 * before — only the caching/preloading scope was broadened.
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
  // v3.46 — seeded from cache (see adCache.js's getCachedEligibleMerchants())
  // instead of `{}`, so a merchant carousel item that was showing correctly
  // before the app was last closed/went offline keeps showing on this very
  // first render too, rather than blanking out until the network round-trip
  // below resolves again (which offline, never happens at all).
  const [eligibleMerchantKeys, setEligibleMerchantKeys] = useState(() => getCachedEligibleMerchants());

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

    // v3.49 — how many times a device that has NEVER completed a single
    // successful sync (see the retry logic in the .catch() below) will
    // retry after a failed attempt, and how far apart. Deliberately short
    // and few: this only exists to survive a flaky first few seconds of a
    // brief connection (e.g. reception WiFi at a venue with no mobile
    // signal at all), not to hammer the server indefinitely for a device
    // that's genuinely offline.
    const STARTUP_RETRY_DELAY_MS = 4000;
    const MAX_STARTUP_RETRIES = 3;
    let startupRetryCount = 0;
    let retryTimeoutId = null;

    // v3.46 — pulled out of the setTimeout below so it can also be called
    // straight from the "online" handler further down (bypassing the
    // throttle there — see its own comment), not just from the debounced
    // per-navigation timer.
    const syncFromNetwork = () => {
      Promise.all([
        base44.entities.CustomAd.list("sort_order"),
        base44.entities.AdSlot.list(),
      ])
      .then(([customAds, adSlots]) => {
        // v3.49 — only mark the sync as done once it actually succeeded.
        // This used to be set unconditionally before the fetch even ran,
        // which meant a sync that FAILED (e.g. the venue's reception WiFi
        // dropped mid-request) still burned the AD_SYNC_INTERVAL_MS
        // throttle window — silently blocking a retry for up to 10 minutes
        // even though nothing was ever actually cached. That directly
        // undermines the reason this warm-up exists in the first place
        // (see the v3.48 note above): a visitor whose only connectivity is
        // a brief WiFi window right when the app is opened must not be
        // able to end up ad-free for the rest of an offline session just
        // because that one attempt happened to fail.
        setLastAdSyncAt(Date.now());
        startupRetryCount = 0;

        // v3.48 — cache every currently active, country-eligible ad across
        // ALL placements AND ALL languages (not just this page's, and not
        // just the app's CURRENT language) — this is the "warm the whole
        // cache while online, up front" pass the user explicitly asked
        // for, so that going offline afterwards has every page's assigned
        // ads (and every attached merchant's/manual item's logo — see
        // preloadAdImages() below) already available, not just whichever
        // ones happened to match today's language. Country is still
        // applied here (it reflects the visitor's actual location, which
        // doesn't change offline), but language is a menu setting the
        // visitor can switch at any time, including while offline — so
        // filtering by it at CACHE time would silently drop every
        // other-language ad from what's available offline. The narrower,
        // CURRENT-language set for what actually renders right now is
        // computed separately just below; only the caching/preloading
        // pass is broadened.
        const allActiveAllLanguages = (customAds || []).filter(
          (a) => a.is_active && a.status !== "pending_review" && matchesCountry(a)
        );
        cacheAds(allActiveAllLanguages);
        cacheSlots(adSlots);
        // v3.46 — warm the (service-worker-backed) image cache for every
        // logo this sync just learned about, so it's already available
        // locally the moment the device goes offline, not just for
        // whichever ad/merchant happened to already be on screen.
        // v3.48 — now fed the ALL-languages list above (not just the
        // current-language one), so a language switch made entirely
        // offline still finds its ads' logos already cached, not blank.
        preloadAdImages(allActiveAllLanguages);

        // The zones actually rendered right now still need to be narrowed
        // to the visitor's CURRENT language — see the comment above.
        const allActive = allActiveAllLanguages.filter((a) => matchesLanguage(a, lang));
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
            .then((resolved) => {
              setEligibleMerchantKeys(resolved || {});
              // v3.46 — see getCachedEligibleMerchants() in adCache.js.
              cacheEligibleMerchants(resolved || {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        setZones(getInitialZones(placement, lang));

        // v3.49 — if this device has NEVER completed a real sync at all
        // (getLastAdSyncAt() persists to localStorage, so "0" means never,
        // not just "not recently"), retry a few times a few seconds apart
        // instead of silently waiting for the next page navigation (which
        // may never come, if the visitor only opened the app once on that
        // brief WiFi window before losing signal) or the next explicit
        // "online" event (which a spotty low-signal connection — as
        // opposed to a clean WiFi disconnect — may never actually fire).
        // Stops retrying the moment ANY sync succeeds, from any trigger.
        if (getLastAdSyncAt() === 0 && startupRetryCount < MAX_STARTUP_RETRIES) {
          startupRetryCount += 1;
          retryTimeoutId = setTimeout(syncFromNetwork, STARTUP_RETRY_DELAY_MS);
        }
      });
    };

    // v3.46 — this effect re-runs on EVERY page navigation
    // (location.pathname is a dependency), which used to mean a fresh
    // network round-trip (CustomAd.list + AdSlot.list, and — for any
    // merchant banner — a third call to merchantReferrals.activeMerchants)
    // on every single page the visitor opened, even though the visitor was
    // always already seeing the best cached/known ad instantly regardless
    // (setZones above). On a phone that's a lot of radio wake-ups —
    // battery/data cost — for zero visible benefit. Now a real sync only
    // actually happens at most once per AD_SYNC_INTERVAL_MS; every other
    // navigation in between just keeps showing what's already cached,
    // which is exactly what would have rendered anyway.
    const fetchId = setTimeout(() => {
      if (Date.now() - getLastAdSyncAt() >= AD_SYNC_INTERVAL_MS) syncFromNetwork();
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
      // v3.46 — coming back online is exactly the moment connectivity (and
      // therefore what SHOULD be showing, and which links can now actually
      // be activated — see AdBannerItem.jsx's useOnlineStatus() use) just
      // changed, so it's worth a real sync here regardless of the throttle
      // above — a single event-driven call, not one per navigation.
      syncFromNetwork();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      clearTimeout(fetchId);
      // v3.49 — the never-synced-yet retry chain (see syncFromNetwork's own
      // .catch() above) must not keep firing after this effect instance is
      // torn down (navigation, unmount, or a dependency change re-running
      // it) — the next instance schedules its own attempt regardless via
      // the 400ms debounce above, so this one's pending retry is redundant
      // once that happens, and left alone would just mean an extra,
      // untracked network call from a stale closure.
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      window.removeEventListener("online", handleOnline);
    };
  }, [isPremium, location.pathname, userCountry, lang]);

  if (isPremium) return { ...EMPTY_ZONES, userCountry, publisherId, eligibleMerchantKeys: {} };
  return { ...zones, userCountry, publisherId, eligibleMerchantKeys };
}
