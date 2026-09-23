import { useEligibleAds } from "@/hooks/useEligibleAds";
import AdBannerItem from "@/components/AdBannerItem";
import AdSenseSlot from "@/components/AdSenseSlot";

/**
 * AdBanner — the TOP-of-page banner stack. Since v2.46 it can hold several
 * banners at once (one placement can now carry more than one active ad),
 * rendered one under another with a small gap between them instead of
 * only ever a single banner.
 *
 * This component no longer positions itself (no `sticky`/`top-*` here) —
 * Layout.jsx renders it directly below the mobile header inside ONE shared
 * sticky wrapper, so the two stick and scroll together as a single unit.
 * That's what replaced the old hardcoded `top-[61px]` offset: a magic
 * number that assumed the header was always exactly that tall, and would
 * have silently gone wrong the moment the header's own height changed (as
 * it now does on notched phones, which pad the header for the safe area).
 *
 * The gap between stacked banners: each AdBannerItem already carries its
 * own `my-0.5` vertical margin, so consecutive banners naturally end up
 * with visible separation without anything extra needed here.
 *
 * v3.30 — `top` is now `{ sourceType, adUnitId, ads }` (see
 * useEligibleAds.js) instead of a plain array: when an admin has assigned
 * this exact slot to Google AdSense, it renders one AdSenseSlot instead of
 * the own-ads/merchant-ads stack.
 */
export default function AdBanner() {
  const { top, userCountry, publisherId, merchantOverrides } = useEligibleAds();

  if (top.sourceType === "adsense") {
    if (!top.adUnitId) return null;
    return (
      <div className="bg-white/90 dark:bg-card/90 backdrop-blur-md border-b border-slate-100 dark:border-border">
        <AdSenseSlot publisherId={publisherId} adUnitId={top.adUnitId} />
      </div>
    );
  }

  if (top.ads.length === 0) return null;

  return (
    <div className="bg-white/90 dark:bg-card/90 backdrop-blur-md border-b border-slate-100 dark:border-border">
      {top.ads.map((ad) => (
        <AdBannerItem key={ad.id} ad={ad} userCountry={userCountry} merchantOverride={merchantOverrides[ad.id]} />
      ))}
    </div>
  );
}
