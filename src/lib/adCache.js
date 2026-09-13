// Offline-first advertising: caches ad creatives locally and tracks impressions
const AD_CACHE_KEY = "catchcount_ad_cache";
const PENDING_IMPRESSIONS_KEY = "catchcount_pending_impressions";
const AD_DATA_KEY = "catchcount_ad_data";

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

// Splits a list of ads into { top, bottom } for a given placement: ads
// assigned to this exact placement take priority over "all pages" ads —
// independently per position, so a page can have its own top banner while
// still falling back to a shared "all pages" bottom banner, or the other
// way round. Each bucket is sorted by sort_order, which is what lets
// several banners share a placement+position and stack in a predictable
// order (added v2.46 — see AdBanner.jsx / BottomAdBanner.jsx).
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
    top: (exactTop.length > 0 ? exactTop : genericTop).slice().sort(bySortOrder),
    bottom: (exactBottom.length > 0 ? exactBottom : genericBottom).slice().sort(bySortOrder),
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