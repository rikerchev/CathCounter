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
    placement: "profile"
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
    placement: "all"
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

export function getCurrentAd(placement) {
  const ads = getCachedAds();

  // Pick by placement: first try exact match, then fall back to "all"
  let ad = ads.find((a) => a.placement === placement);
  if (!ad) ad = ads.find((a) => a.placement === "all" || !a.placement);
  if (!ad) ad = ads[0];

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