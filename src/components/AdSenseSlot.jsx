import { useEffect, useRef } from "react";

// v3.30 — a manual Google AdSense "Ad unit", rendered in place of the
// normal own-ads/merchant-ads stack when an admin picks "Google AdSense" as
// this exact banner's source (Admin → Рекламни слотове → "Източник" — see
// server/schema/schema.sql's ad_slots.source_type/adsense_ad_unit_id
// comment). This is deliberately independent of AdSenseLoader.jsx's global
// "Auto ads" toggle (Admin → Настройка → Google AdSense): an admin who
// explicitly assigned AdSense to one specific slot clearly wants content
// there regardless of whether the separate, account-wide Auto-ads script is
// also turned on — so this component loads adsbygoogle.js itself if it
// isn't already on the page (same script either way; Google supports Auto
// ads and manual units side by side).
//
// v3.31 — supports both ad-unit shapes Google's "Create ad unit" wizard can
// hand you: a standard "Display ad" (responsive — the code Google gives you
// is just `data-ad-format="auto" data-full-width-responsive="true"`, which
// is what this rendered before this version), or an "In-feed ad" (styled to
// blend into a content feed — Google's code for those additionally carries
// `data-ad-format="fluid"` and a `data-ad-layout-key="..."` value unique to
// that specific ad unit). Passing `layoutKey` switches this to the in-feed
// shape; leaving it unset keeps the original standard-Display-ad rendering
// exactly as before — see AdManagement.jsx's optional "Ad layout key" field.
//
// v3.32 — the wrapper below now caps its width (`max-w-xl`) instead of
// stretching edge-to-edge, AND `data-full-width-responsive` is now "false"
// (was "true"). That flag isn't cosmetic — its documented job is to let the
// ad break OUT of a narrower parent and stretch to the full browser width
// on its own, via a negative-margin CSS trick Google's own script applies.
// With it left "true", capping the wrapper's width alone did nothing: the
// ad kept expanding to full page width regardless, and the wider the ad,
// the taller Google's "auto" algorithm makes it — easily 250-300px, before
// any ad even loaded. "false" makes it respect the actual container width
// instead, which is what lets `max-w-xl` finally take effect and keep the
// reserved height compact. (Unlike forcing a fixed HEIGHT via CSS, which
// Google's own docs warn can visibly deform the ad, this only narrows the
// WIDTH their sizing algorithm works within — a supported, documented way
// to get a shorter "auto" ad.)
export default function AdSenseSlot({ publisherId, adUnitId, layoutKey }) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!publisherId || !adUnitId) return;
    if (!document.querySelector("script[data-adsense-loader]")) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
      script.crossOrigin = "anonymous";
      script.dataset.adsenseLoader = "true";
      document.head.appendChild(script);
    }
    if (pushedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (e) {
      console.error("AdSenseSlot push error:", e);
    }
  }, [publisherId, adUnitId, layoutKey]);

  if (!publisherId || !adUnitId) return null;

  return (
    <div className="mx-auto my-0.5 max-w-xl px-2">
      {layoutKey ? (
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-format="fluid"
          data-ad-layout-key={layoutKey}
          data-ad-client={publisherId}
          data-ad-slot={adUnitId}
        />
      ) : (
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={publisherId}
          data-ad-slot={adUnitId}
          data-ad-format="auto"
          data-full-width-responsive="false"
        />
      )}
    </div>
  );
}
