import { useEffect } from "react";
import { usePremium } from "@/hooks/usePremium";
import { useAdSenseInfo } from "@/hooks/useAdSenseInfo";

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
 *
 * v3.30 — the { enabled, publisherId } fetch itself moved into the shared
 * useAdSenseInfo() hook (unchanged behaviour here) so the new per-slot
 * manual AdSense units (AdSenseSlot.jsx) can reuse the same publisherId
 * without each mount hitting /api/settings/adsense on its own. The same
 * adsbygoogle.js script this loads also serves those manual units — Google
 * supports Auto ads and manual `<ins>` units side by side on one page.
 */
export default function AdSenseLoader() {
  const { isPremium } = usePremium();
  const { enabled, publisherId } = useAdSenseInfo();

  useEffect(() => {
    if (!enabled || !publisherId || isPremium) return;
    if (document.querySelector("script[data-adsense-loader]")) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseLoader = "true";
    document.head.appendChild(script);
  }, [enabled, publisherId, isPremium]);

  return null;
}
