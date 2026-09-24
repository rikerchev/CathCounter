// Offline-first advertising: caches ad creatives locally and tracks impressions
const AD_CACHE_KEY = "catchcount_ad_cache";
const PENDING_IMPRESSIONS_KEY = "catchcount_pending_impressions";
const AD_DATA_KEY = "catchcount_ad_data";
// v2.53 — separate cache for AdSlot records (used to render the "advertise
// here" placeholder banner before the network responds — see
// getCachedSlots()/cacheSlots() below and useEligibleAds.js).
const AD_SLOT_CACHE_KEY = "catchcount_adslot_cache";
// v3.46 — see getCachedEligibleMerchants()/cacheEligibleMerchants() below.
const ELIGIBLE_MERCHANTS_CACHE_KEY = "catchcount_eligible_merchants_cache";
// v3.46 — see getLastAdSyncAt()/setLastAdSyncAt() below.
const AD_SYNC_AT_KEY = "catchcount_ad_sync_at";
// v3.58 — see getLastEligibilitySyncAt()/setLastEligibilitySyncAt() below.
const ELIGIBILITY_SYNC_AT_KEY = "catchcount_eligibility_sync_at";

// Default ad creatives (fallback when no internet)
const DEFAULT_ADS = [
  {
    id: "default_1",
    title: "ad.premiumTitle",
    description: "ad.premiumDesc",
    cta: "ad.premiumCta",
    link: "/profile",
    image_url: null,
    bg_class: "bg-gradient-to-r from-cyan-600 to-blue-600",
    text_class: "text-white",
    is_translation_key: true,
    placement: "profile",
    languages: "all"
  },
  {
    id: "default_2",
    title: "ad.advertiseHereTitle",
    description: "ad.advertiseHereDesc",
    cta: "ad.advertiseHereCta",
    link: "/advertise",
    image_url: null,
    bg_class: "bg-gradient-to-r from-emerald-600 to-teal-600",
    text_class: "text-white",
    is_translation_key: true,
    placement: "all",
    languages: "all"
  }
];

export function getCachedAds() {
  try {
    const cached = localStorage.getItem(AD_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ads && parsed.ads.length > 0) {
        return parsed.ads;
      }
    }
  } catch (e) {
    console.error("getCachedAds error:", e);
  }
  return DEFAULT_ADS;
}

export function cacheAds(ads) {
  try {
    localStorage.setItem(AD_CACHE_KEY, JSON.stringify({
      ads: ads,
      cached_at: Date.now()
    }));
  } catch (e) {
    console.error("cacheAds error:", e);
  }
}

// v2.53 — AdSlot records (admin-defined rentable placements, see
// AdminAdSlots.jsx) weren't cached at all before this, only the real ads
// were. That meant the "advertise here" placeholder banner (built from a
// slot when a placement has no real ad yet — see useEligibleAds.js) could
// only ever appear AFTER the network round-trip finished, never on the
// synchronous first render. The moment it popped in, it pushed everything
// below it (including the "Инсталирай приложението" banner and its button)
// down the page — so a tap aimed at that button could land on whatever had
// just shifted into its place instead. Caching the slot list, the same way
// real ads already were, lets the very next page load render the correct
// placeholder immediately from cache, with nothing shifting afterwards.
export function getCachedSlots() {
  try {
    const cached = localStorage.getItem(AD_SLOT_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.slots)) return parsed.slots;
    }
  } catch (e) {
    console.error("getCachedSlots error:", e);
  }
  return [];
}

export function cacheSlots(slots) {
  try {
    localStorage.setItem(AD_SLOT_CACHE_KEY, JSON.stringify({
      slots: slots || [],
      cached_at: Date.now()
    }));
  } catch (e) {
    console.error("cacheSlots error:", e);
  }
}

// v3.46 — mirrors getCachedAds()/cacheAds() above, but for the SERVER-
// resolved "type:id" eligibility keys per ad (see
// server/routes/merchantReferrals.ts and useEligibleAds.js). Before this,
// eligibleMerchantKeys started every session as `{}` and only ever got
// filled in AFTER a successful network round-trip — so a merchant carousel
// item that had been showing perfectly well while online would vanish
// (AdBannerItem.jsx falls back to manual_items only, or shows nothing)
// the moment the device went offline, even though nothing about that
// merchant's actual eligibility had changed. Caching this the same way
// real ads already are lets it keep showing its LAST-KNOWN eligibility
// while offline instead of being dropped.
export function getCachedEligibleMerchants() {
  try {
    const cached = localStorage.getItem(ELIGIBLE_MERCHANTS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.keys && typeof parsed.keys === "object") return parsed.keys;
    }
  } catch (e) {
    console.error("getCachedEligibleMerchants error:", e);
  }
  return {};
}

export function cacheEligibleMerchants(keys) {
  try {
    localStorage.setItem(
      ELIGIBLE_MERCHANTS_CACHE_KEY,
      JSON.stringify({ keys: keys || {}, cached_at: Date.now() })
    );
  } catch (e) {
    console.error("cacheEligibleMerchants error:", e);
  }
}

// v3.46 — throttle for how often useEligibleAds.js actually hits the
// network for a fresh ad/slot/merchant-eligibility sync. Before this, that
// hook's effect re-ran its full network round-trip (CustomAd.list +
// AdSlot.list, and — for any merchant banner — a THIRD call to
// merchantReferrals.activeMerchants) on every single page navigation,
// since `location.pathname` is one of its dependencies. The visitor was
// always already seeing the best cached/known ad instantly regardless (see
// getInitialZones()), so that constant re-fetching bought nothing visible
// — only battery/data cost from waking the radio on every page change,
// which is exactly what was reported. Persisted to localStorage (not just
// a module-level variable) so the throttle survives a full app
// reload/reopen too, not just client-side navigation within one running
// session.
export const AD_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 минути

export function getLastAdSyncAt() {
  try {
    return Number(localStorage.getItem(AD_SYNC_AT_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

export function setLastAdSyncAt(timestamp) {
  try {
    localStorage.setItem(AD_SYNC_AT_KEY, String(timestamp));
  } catch (e) {
    console.error("setLastAdSyncAt error:", e);
  }
}

// v3.58 — separate, much shorter throttle for re-checking merchant
// ELIGIBILITY specifically (server/routes/merchantReferrals.ts's
// active-merchants — which of an ad's attached merchants currently have a
// QR-code referral), independent of AD_SYNC_INTERVAL_MS above.
//
// Reported bug: two devices logged into the SAME account, both viewing the
// SAME merchant-carousel banner, showing DIFFERENT things — one device's
// merchant list was up to date, the other's was stuck on whatever it last
// knew, for up to the full 10 minutes of AD_SYNC_INTERVAL_MS. Confirmed
// live: server-side both attached merchants (SMAX, Рибарник Писанец) DID
// have a live registration; the stale device's local cache of
// eligibleMerchantKeys (see getCachedEligibleMerchants() below) just
// hadn't been re-synced yet, since it's bundled into the SAME 10-minute
// throttle as the full ad/slot creative refresh (see useEligibleAds.js's
// syncFromNetwork()).
//
// The ad CREATIVES (title/logo/description/etc) rarely change and are
// exactly what AD_SYNC_INTERVAL_MS's 10-minute battery-saving throttle was
// built for (v3.46). Eligibility is the opposite: the entire point of the
// merchant-banner feature is to react to a friend scanning a QR code
// *while someone is actively fishing* — a visitor genuinely expects that
// to show up within about a minute, on every device, not "whenever this
// particular device's next 10-minute ad resync happens to land". So this
// gets its own, independent, much shorter interval — see
// checkEligibility() in useEligibleAds.js, which polls just this one
// lightweight endpoint (no full CustomAd.list()/AdSlot.list() round-trip)
// on this cadence for as long as any page with a merchant banner is open,
// without touching the existing 10-minute ad/slot creative throttle at
// all.
export const ELIGIBILITY_SYNC_INTERVAL_MS = 90 * 1000; // 90 секунди

export function getLastEligibilitySyncAt() {
  try {
    return Number(localStorage.getItem(ELIGIBILITY_SYNC_AT_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

export function setLastEligibilitySyncAt(timestamp) {
  try {
    localStorage.setItem(ELIGIBILITY_SYNC_AT_KEY, String(timestamp));
  } catch (e) {
    console.error("setLastEligibilitySyncAt error:", e);
  }
}

// v3.64 — near-real-time "did an admin change something" signal, separate
// from both throttles above. See server/routes/publicSettings.ts's
// ads-version endpoint for what it returns and why it's cheap (a single
// MAX(updated_at), no ad/slot content at all). useEligibleAds.js polls it
// on this short interval and, ONLY when the returned value actually moved
// since the last poll, triggers the real (heavier) resync immediately —
// bypassing AD_SYNC_INTERVAL_MS's 10-minute throttle entirely for that one
// call, since a genuine admin change is exactly the case that throttle was
// never meant to delay. Reported directly: a brand-new merchant banner,
// saved by the admin, still hadn't reached an already-open phone 5 minutes
// later — this closes that gap down to (at most) this poll interval.
export const AD_VERSION_POLL_INTERVAL_MS = 30 * 1000; // 30 секунди

const AD_VERSION_KEY = "catchcount_ad_version";

export function getCachedAdVersion() {
  try {
    return localStorage.getItem(AD_VERSION_KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setCachedAdVersion(version) {
  try {
    localStorage.setItem(AD_VERSION_KEY, version || "");
  } catch (e) {
    console.error("setCachedAdVersion error:", e);
  }
}

// v3.46 — fire-and-forget warm of the browser's (service-worker-backed —
// see public/sw.js's cache-first static-asset handler) cache for every ad
// logo referenced by a freshly-synced ad list, INCLUDING each ad's
// attached merchants and manual carousel items (see AdBannerItem.jsx's
// buildCarouselItems()), not just each ad's own top-level logo_url/
// image_url. Without this, a carousel item nobody had actually scrolled to
// yet while online had no locally-cached image bytes at all — so going
// offline right after a sync still meant a blank/broken logo the first
// time that particular item's turn came up in rotation. `new Image().src =
// url` is enough to trigger a real browser fetch (intercepted and cached
// by the service worker exactly like any other GET) without ever
// inserting anything into the DOM.
export function preloadAdImages(ads) {
  if (typeof window === "undefined" || typeof Image === "undefined") return;
  const urls = new Set();
  const addUrl = (u) => {
    if (u && typeof u === "string") urls.add(u);
  };
  for (const ad of ads || []) {
    addUrl(ad.logo_url);
    addUrl(ad.image_url);
    for (const key of ["merchants", "manual_items"]) {
      if (!ad[key]) continue;
      try {
        const list = JSON.parse(ad[key]);
        if (Array.isArray(list)) list.forEach((item) => addUrl(item?.logo_url));
      } catch {
        // malformed JSON — nothing to preload from it
      }
    }
  }
  urls.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

// An ad with no `languages` set (or "all") is shown regardless of the app's
// current UI language. Otherwise it is only eligible when `lang` is one of
// its listed codes — this is what lets the very same placement carry a
// different sponsor per language (e.g. a Bulgarian-only ad on "Активна
// сесия" leaves that placement free for an English or German advertiser).
export function matchesLanguage(ad, lang) {
  if (!ad || !ad.languages || ad.languages === "all") return true;
  if (!lang) return true;
  return ad.languages
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .includes(String(lang).toLowerCase());
}

// Splits a list of ads into { top, bottom } for a given placement —
// independently per position, so a page can have its own top banner while
// still showing a shared "all pages" bottom banner, or the other way round.
//
// v3.63 — ads assigned to this EXACT placement now STACK together with
// "all pages" ads instead of the exact ones excluding the generic ones
// entirely. Before this, a single ad assigned to this exact page was enough
// to make every "all pages" banner vanish from this position on this page —
// not rotate together, not show alongside, just disappear — which silently
// hid a brand new "all pages" merchant banner (see CustomAds.jsx) on any
// page that already had its own exact-placement ad, with no indication to
// the admin that anything was wrong. Reported: two freshly-added merchant
// banners (Yantra Fishing, TS Fishing), both saved and even
// forced-displayed, never once appeared on a page where SMAX's and Рибарник
// Писанец's ads were already assigned specifically to that page. The
// explicit product intent going forward is that a free-tier visitor should
// see MORE eligible banners, not fewer — every exact-placement ad plus
// every "all pages" ad now all stack in the same zone, exact ones first
// (still the most page-relevant), each group internally ordered by
// sort_order exactly as before.
export function bucketAdsByPosition(ads, placement) {
  const exactTop = [], exactBottom = [], genericTop = [], genericBottom = [];
  for (const a of ads || []) {
    const pos = a.banner_position || "top";
    const isExact = a.placement === placement;
    const isGeneric = a.placement === "all" || !a.placement;
    if (isExact) (pos === "bottom" ? exactBottom : exactTop).push(a);
    else if (isGeneric) (pos === "bottom" ? genericBottom : genericTop).push(a);
  }
  const bySortOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  return {
    top: [...exactTop.slice().sort(bySortOrder), ...genericTop.slice().sort(bySortOrder)],
    bottom: [...exactBottom.slice().sort(bySortOrder), ...genericBottom.slice().sort(bySortOrder)],
  };
}

// Cache-based equivalent of getCurrentAd() below, but returns every
// eligible ad for the placement (split top/bottom) instead of just one —
// several banners can now be active for the same placement at once.
export function getCurrentAds(placement, lang) {
  const ads = getCachedAds().filter((a) => matchesLanguage(a, lang));
  const { top, bottom } = bucketAdsByPosition(ads, placement);
  for (const ad of [...top, ...bottom]) trackImpression(ad.id);
  return { top, bottom };
}

// v3.30 — precedence-aware AdSlot lookup, shared by every place that needs
// "the AdSlot admin-configured for this exact placement+position": an
// exact-placement slot always wins over a generic "all pages" one, among
// slots the admin hasn't hidden (is_available !== false). Previously
// duplicated near-identically in useEligibleAds.js (pickAvailableSlot) and
// AdManagement.jsx (pickPreviewSlot) — pulled out here so the "advertise
// here" placeholder rule and the new per-slot source-type rule (below) can
// never drift apart between the live site and its admin preview.
//
// v3.45 — optional `lang`: when passed, a slot restricted to specific
// languages (ad_slots.languages, same "all"/"bg,en,..." shape as a custom
// ad's own `languages`) is skipped for a visitor whose menu language isn't
// in that list — reuses matchesLanguage() below since it only reads
// `.languages` off whatever object it's given. Omitting `lang` (e.g. the
// admin's own preview in AdManagement.jsx) keeps every slot eligible,
// exactly as before this existed.
export function findSlotForPosition(slots, placement, position, lang) {
  const eligible = (slots || []).filter(
    (s) =>
      s.is_available !== false &&
      (s.banner_position || "top") === position &&
      (lang === undefined || matchesLanguage(s, lang))
  );
  return (
    eligible.find((s) => s.placement === placement) ||
    eligible.find((s) => s.placement === "all" || !s.placement) ||
    null
  );
}

// v3.44 — shared by CustomAds.jsx (admin UI, for both the custom-ads
// rotation_seconds field above and the new manual_items per-item duration
// below) and AdBannerItem.jsx (the live merchant-banner carousel, for its
// manual items' own configured duration). Pulled out here — rather than
// staying a page-local helper in CustomAds.jsx as it originally was —
// specifically so a component (not just a page) can import it too.
export function rotationUiToSeconds(value, unit) {
  const n = Math.max(1, Math.round(Number(value)) || 1);
  if (unit === "hours") return n * 3600;
  if (unit === "minutes") return n * 60;
  return n;
}

// v3.44 — every ELIGIBLE merchant (see server/routes/merchantReferrals.ts's
// active-merchants handler) gets this same flat number of seconds per turn
// in the live merchant-banner carousel (AdBannerItem.jsx), regardless of how
// many QR-code referrals it has — deliberately NOT proportional to that
// count, which would otherwise let anyone watching the banner back-calculate
// a merchant's (private) referral count from how long its turn lasted. Must
// match the "10 seconds" the referral flow is described as granting.
export const MERCHANT_TURN_SECONDS = 10;

// v3.30 — weighted rotation among 2+ CUSTOM ADS sharing one exact
// placement+position bucket. Distinct from the existing per-ad MERCHANT
// rotation (AdBannerItem.jsx's resolveActiveMerchant), which rotates
// snapshots WITHIN a single ad row — this one rotates between DIFFERENT
// custom_ads rows. An ad opts in by having `rotation_seconds` set (> 0) in
// "Собствени реклами"; ads without it keep stacking exactly as before,
// completely unaffected (so this is a no-op for every ad that existed
// before v3.30). When 2+ ads in the same bucket opt in, they take turns
// instead of stacking, each shown for its own configured number of seconds
// in a repeating cycle (order = sort_order), switching deterministically by
// wall-clock time so every visitor sees the same one at a given moment —
// same "changes on next page load/navigation" rule as the merchant
// rotation, no live ticking timer.
export function applyCustomAdRotation(ads) {
  const rotating = (ads || []).filter((a) => Number(a.rotation_seconds) > 0);
  if (rotating.length < 2) return ads; // nothing to rotate among — leave as-is
  const sorted = rotating.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const total = sorted.reduce((sum, a) => sum + Number(a.rotation_seconds), 0);
  let pos = Math.floor(Date.now() / 1000) % total;
  let active = sorted[0];
  for (const ad of sorted) {
    if (pos < Number(ad.rotation_seconds)) {
      active = ad;
      break;
    }
    pos -= Number(ad.rotation_seconds);
  }
  const rotatingIds = new Set(rotating.map((a) => a.id));
  // Keep every non-rotating ad exactly where it was (still stacked), and
  // replace the whole rotating group with just the one currently active —
  // preserves the original relative order via the source array's own order.
  return (ads || []).filter((a) => !rotatingIds.has(a.id) || a.id === active.id);
}

// v3.30 — resolves what actually fills one banner zone (top/bottom) for a
// placement: the admin's chosen SOURCE for that exact slot (Google
// AdSense / own ads / partner-merchant ads — see AdManagement.jsx's
// "Източник" control on the AdSlot form), defaulting to "custom" (today's
// unrestricted stacking behaviour) whenever no AdSlot row exists yet for
// this exact placement+position, or its source_type was never set — so
// every banner nobody has touched since this feature shipped keeps working
// exactly as it always did. Shared by useEligibleAds.js (the live site) and
// AdManagement.jsx (its own preview), so both can never show different
// things for the same slot.
//
// v3.45 — optional `lang`, passed straight through to findSlotForPosition()
// above: a language-restricted slot is treated as if it didn't exist for a
// visitor outside its allowed languages (falls through to the next-best
// slot, or none). AdManagement.jsx's own preview calls this without `lang`
// so the admin always sees every slot regardless of language.
export function resolveZone(ads, slots, placement, position, lang) {
  const slot = findSlotForPosition(slots, placement, position, lang);
  const sourceType = slot?.source_type || "custom";

  if (sourceType === "adsense") {
    // v3.31 — `adsense_ad_layout_key` is only set when the admin created an
    // "In-feed" AdSense ad unit (Google's code for those includes
    // data-ad-format="fluid" data-ad-layout-key="..." instead of the plain
    // data-ad-format="auto" a standard Display ad unit uses) — see
    // AdSenseSlot.jsx for how the two render differently.
    return {
      sourceType,
      adUnitId: slot?.adsense_ad_unit_id || null,
      adUnitLayoutKey: slot?.adsense_ad_layout_key || null,
      ads: [],
      slot,
    };
  }

  let bucket = bucketAdsByPosition(ads, placement)[position];
  if (sourceType === "merchant") {
    // v3.44 — a merchant-source banner is eligible for this zone as long as
    // it carries EITHER at least one attached merchant (a.merchants, v3.26)
    // OR at least one manually-entered carousel item (a.manual_items,
    // v3.44) — previously this required a.merchants alone, which meant a
    // banner with only manual items (no merchant attached yet) was silently
    // dropped instead of showing its manual ad(s).
    bucket = bucket.filter((a) => {
      const hasList = (raw) => {
        if (!raw) return false;
        try {
          const list = JSON.parse(raw);
          return Array.isArray(list) && list.length > 0;
        } catch {
          return false;
        }
      };
      return hasList(a.merchants) || hasList(a.manual_items);
    });
  } else {
    bucket = applyCustomAdRotation(bucket);
  }
  return { sourceType, adUnitId: null, adUnitLayoutKey: null, ads: bucket, slot };
}

export function getCurrentAd(placement, lang) {
  const ads = getCachedAds().filter((a) => matchesLanguage(a, lang));

  // Pick by placement: first try an exact match, then fall back to an "all
  // pages" ad. Previously, when neither matched, this fell all the way back
  // to `ads[0]` — the very first ad in the whole cached list, regardless of
  // its placement. That meant a single ad assigned to just one page (e.g.
  // "Активна сесия") could end up showing on every other page too, any time
  // no ad was assigned to that other page. Now, if nothing is actually
  // assigned to this placement (and no "all pages" ad exists either), no ad
  // is shown here — the placement is correctly left free.
  let ad = ads.find((a) => a.placement === placement);
  if (!ad) ad = ads.find((a) => a.placement === "all" || !a.placement);
  if (!ad) return null;

  // Track impression (will be sent when online)
  trackImpression(ad.id);

  return ad;
}

export function trackImpression(adId) {
  try {
    const pending = localStorage.getItem(PENDING_IMPRESSIONS_KEY);
    const impressions = pending ? JSON.parse(pending) : [];
    impressions.push({
      adId,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(PENDING_IMPRESSIONS_KEY, JSON.stringify(impressions));
  } catch (e) {
    console.error("trackImpression error:", e);
  }
}

export function getPendingImpressions() {
  try {
    const pending = localStorage.getItem(PENDING_IMPRESSIONS_KEY);
    return pending ? JSON.parse(pending) : [];
  } catch (e) {
    return [];
  }
}

export function clearPendingImpressions() {
  localStorage.removeItem(PENDING_IMPRESSIONS_KEY);
}

function getAdRotationData() {
  try {
    const data = localStorage.getItem(AD_DATA_KEY);
    return data ? JSON.parse(data) : { rotationIndex: 0, lastShown: 0 };
  } catch (e) {
    return { rotationIndex: 0, lastShown: 0 };
  }
}

function setAdRotationData(data) {
  try {
    localStorage.setItem(AD_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("setAdRotationData error:", e);
  }
}