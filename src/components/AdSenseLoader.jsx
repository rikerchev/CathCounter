import { useEffect, useState } from "react";
import { usePremium } from "@/hooks/usePremium";
import { base44 } from "@/api/base44Client";

/**
 * AdSenseLoader — v2.68. Loads Google's "Auto ads" script (which decides
 * for itself where on the page there's free room, so it never displaces a
 * real CustomAd/AdSlot banner — see useEligibleAds.js's own "never displace
 * a real ad" rule for the same principle applied to the in-house slot
 * system) for a non-premium visitor, but ONLY once the admin has:
 *   1. turned it on, and
 *   2. entered their own approved AdSense publisher ID
 * in Admin → Настройка → Google AdSense. Until then this renders nothing
 * and does nothing — completely inert. Mounted once in Layout.jsx.
 */
export default function AdSenseLoader() {
  const { isPremium } = usePremium();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    base44.settings
      .getAdSenseInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    if (!info?.enabled || !info?.publisherId || isPremium) return;
    if (document.querySelector("script[data-adsense-loader]")) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(info.publisherId)}`;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseLoader = "true";
    document.head.appendChild(script);
  }, [info, isPremium]);

  return null;
}
