import { useRef, useLayoutEffect } from "react";
import { useEligibleAds } from "@/hooks/useEligibleAds";
import AdBannerItem from "@/components/AdBannerItem";

/**
 * BottomAdBanner — the BOTTOM-of-page banner stack, new in v2.46. Pinned
 * to the very bottom of the screen (like a mini bottom bar) regardless of
 * how tall the page's own content is, with any number of bottom-assigned
 * ads stacked above one another.
 *
 * Being `position: fixed` means it would otherwise sit ON TOP of whatever
 * page content happens to be at the bottom of the screen. To avoid that,
 * this measures its own rendered height (which changes with 0/1/2+ ads,
 * and with each ad's chosen size) and writes it to the `--bottom-ads-h`
 * CSS variable on the page root; Layout.jsx applies that as bottom padding
 * on <main>, so page content always has exactly enough room reserved,
 * whether there are bottom banners today or not, or how many.
 *
 * `env(safe-area-inset-bottom)` keeps it clear of the home-indicator strip
 * on notched phones — see energy/layout notes in the project docs for why
 * the browser's OWN address/toolbar can't be controlled from here at all.
 */
export default function BottomAdBanner() {
  const { bottom, userCountry } = useEligibleAds();
  const ref = useRef(null);

  useLayoutEffect(() => {
    const setVar = (h) => document.documentElement.style.setProperty("--bottom-ads-h", `${h}px`);
    const el = ref.current;
    if (!el || bottom.length === 0) {
      setVar(0);
      return;
    }
    setVar(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setVar(el.offsetHeight));
    ro.observe(el);
    return () => {
      ro.disconnect();
      setVar(0);
    };
  }, [bottom.length]);

  if (bottom.length === 0) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-20 bg-white/90 dark:bg-card/90 backdrop-blur-md border-t border-slate-100 dark:border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {bottom.map((ad) => (
        <AdBannerItem key={ad.id} ad={ad} userCountry={userCountry} />
      ))}
    </div>
  );
}
