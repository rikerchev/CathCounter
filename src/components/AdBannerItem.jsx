import { useState, useEffect, useMemo } from "react";
import { useLanguage } from "@/lib/i18n";
import { Link } from "react-router-dom";
import { MERCHANT_TURN_SECONDS } from "@/lib/adCache";

const LOGO_SIZE_CLASSES = {
  "16x16": "w-16 h-16",
  "32x16": "w-32 h-16",
  "48x16": "w-48 h-16",
  auto: "w-auto h-auto max-w-full max-h-24",
};

// Padding/text scale per `banner_size` — "normal" matches the original,
// single-size look this app always had; "compact"/"large" are new in v2.46.
const SIZE_CLASSES = {
  compact: { wrap: "px-2 py-0", title: "text-xs", desc: "text-[10px]", logo: "w-10 h-10" },
  normal: { wrap: "px-2 py-0.5", title: "text-sm", desc: "text-[11px]", logo: "w-12 h-12" },
  large: { wrap: "px-3 py-2", title: "text-base", desc: "text-xs", logo: "w-16 h-16" },
};

// Fallback for a manually-entered carousel item with no configured
// duration (shouldn't normally happen — CustomAds.jsx always writes one —
// but keeps this component safe against older/malformed rows).
const DEFAULT_MANUAL_DURATION_SECONDS = 10;

// v3.44 — builds the combined, in-order list of items this banner's live
// carousel rotates through: the ad's OWN content (v3.45 — see below),
// every currently-ELIGIBLE attached merchant (see
// server/routes/merchantReferrals.ts — `eligibleMerchantKeys` is that
// resolved list, one "type:id" string per eligible merchant, or undefined
// while it hasn't resolved yet), each getting the same flat
// MERCHANT_TURN_SECONDS turn length (see adCache.js for why it's flat, not
// proportional to referral count — that would leak the private count),
// followed by every manually-entered item (each keeping its own configured
// duration, set in CustomAds.jsx). Returns [] when there's nothing besides
// the ad's own content to rotate with, meaning "render the ad's own plain
// fields instead" (see the caller) — the pre-v3.44 behaviour for an
// ordinary ad, unchanged.
//
// v3.45 — an attached merchant no longer REPLACES the ad's own title/
// description/link/logo (CustomAds.jsx no longer disables those fields
// either) — instead, whenever this ad has 1+ merchants and/or manual
// items, its OWN content becomes just one more item in the same live
// carousel, shown for `own_content_duration_seconds` (a new, separate
// field — deliberately NOT reusing `rotation_seconds`, which stays exactly
// what it always was: the unrelated cross-ROW rotation in adCache.js's
// applyCustomAdRotation()). With nothing else attached, the ad's own
// content is simply rendered directly (the plain, non-carousel branch
// below) exactly as before this feature existed — this function isn't even
// called for that case in spirit, though it still returns [] correctly if
// it were.
//
// While `eligibleMerchantKeys` is still undefined (the network resolution
// in useEligibleAds.js hasn't come back yet), attached merchants are left
// out entirely rather than guessed at — so a merchant is never shown and
// then yanked away a moment later once it turns out to be ineligible. A
// banner with manual items (or its own content) keeps showing those the
// whole time regardless, since neither depends on that resolution.
function buildCarouselItems(ad, eligibleMerchantKeys) {
  let merchantList = [];
  try {
    const parsed = ad?.merchants ? JSON.parse(ad.merchants) : [];
    if (Array.isArray(parsed)) merchantList = parsed;
  } catch {
    merchantList = [];
  }

  let manualList = [];
  try {
    const parsed = ad?.manual_items ? JSON.parse(ad.manual_items) : [];
    if (Array.isArray(parsed)) manualList = parsed;
  } catch {
    manualList = [];
  }

  if (merchantList.length === 0 && manualList.length === 0) return [];

  const items = [];

  // v3.45 — the ad's own base content, always included (never overridden)
  // once there's something else to rotate with.
  if (ad?.title) {
    const ownSeconds =
      Number(ad.own_content_duration_seconds) > 0
        ? Number(ad.own_content_duration_seconds)
        : DEFAULT_MANUAL_DURATION_SECONDS;
    items.push({
      key: "own",
      title: ad.title || "",
      description: ad.description || "",
      logoUrl: ad.logo_url || "",
      logoSize: ad.logo_size || "auto",
      link: ad.link || "/advertise",
      durationSeconds: ownSeconds,
    });
  }

  if (merchantList.length > 0 && Array.isArray(eligibleMerchantKeys)) {
    const eligibleSet = new Set(eligibleMerchantKeys);
    for (const m of merchantList) {
      if (!m?.type || !m?.id) continue;
      if (!eligibleSet.has(`${m.type}:${m.id}`)) continue;
      items.push({
        key: `merchant:${m.type}:${m.id}`,
        title: m.name || "",
        description: m.description || "",
        logoUrl: m.logo_url || "",
        logoSize: m.logo_size || "auto",
        // v3.45 — the merchant's OWN link (venues.ad_link, falling back to
        // venues.website — see CustomAds.jsx's snapshotMerchant()) always
        // wins. If truly neither is set, this must NOT fall back to
        // anything else: not `ad.link` (a DIFFERENT business's own
        // destination — the first bug reported after the initial v3.45
        // deploy), and not "/advertise" either (the SECOND bug reported: a
        // merchant earning free rotation through QR referrals must never
        // have its own turn solicit the visitor to go buy a paid ad slot —
        // that flatly contradicts the whole point of the bonus-time rules
        // this rotation exists to honor). `null` here means "this turn
        // isn't a link at all" — see the component below, which renders a
        // merchant with no link as plain, non-clickable content instead of
        // guessing at a destination.
        link: m.link || null,
        durationSeconds: MERCHANT_TURN_SECONDS,
      });
    }
  }

  manualList.forEach((item, i) => {
    if (!item) return;
    const seconds =
      Number(item.duration_seconds) > 0 ? Number(item.duration_seconds) : DEFAULT_MANUAL_DURATION_SECONDS;
    items.push({
      key: `manual:${item.id || i}`,
      title: item.title || "",
      description: item.description || "",
      logoUrl: item.logo_url || "",
      logoSize: item.logo_size || "auto",
      link: item.link || ad.link || "/advertise",
      durationSeconds: seconds,
    });
  });

  return items;
}

/**
 * AdBannerItem — renders a single ad's own visual bar (color, logo, title,
 * description, link). Shared by AdBanner.jsx (top stack) and
 * BottomAdBanner.jsx (bottom stack), which each just decide layout/stacking
 * and hand one `ad` at a time to this component. Pulled out of AdBanner.jsx
 * in v2.46 when banners stopped being one-per-page.
 *
 * v3.44 — a banner with 1+ attached merchants and/or manual items (see
 * buildCarouselItems() above) is now a genuine LIVE, client-side carousel:
 * with 2+ combined items it ticks through them with a real timer
 * (setTimeout, rescheduled after every switch for the NEW active item's
 * own duration), visibly switching in the visitor's browser without a page
 * reload or navigation. That's a deliberate departure from every other
 * rotation in this app (the old single-merchant-winner resolution this
 * replaces, and the separate, unrelated custom-ads `rotation_seconds`
 * feature in adCache.js), which only ever changed deterministically on the
 * next page load/navigation. With exactly 1 combined item it just renders
 * statically (no timer needed — nothing to switch to). With 0 (no
 * merchants and no manual items attached at all) it falls back to the ad's
 * own plain fields — including the country/language text overrides —
 * exactly as any ordinary "Собствена реклама" always has.
 *
 * v3.45 — the ad's own content (title/description/link/logo) is always
 * editable now (CustomAds.jsx no longer locks it when merchants are
 * attached) and always participates as one of the carousel items above,
 * rather than being replaced by an attached merchant.
 */
export default function AdBannerItem({ ad, userCountry, eligibleMerchantKeys }) {
  const { t, lang } = useLanguage();

  const items = useMemo(
    () => (ad ? buildCarouselItems(ad, eligibleMerchantKeys) : []),
    [
      ad?.id,
      ad?.title,
      ad?.description,
      ad?.logo_url,
      ad?.logo_size,
      ad?.own_content_duration_seconds,
      ad?.merchants,
      ad?.manual_items,
      ad?.link,
      eligibleMerchantKeys,
    ]
  );

  const [activeIndex, setActiveIndex] = useState(0);

  // A different ad, or its item count changing (e.g. eligibility just
  // resolved), starts the carousel back at the first item rather than
  // risking a stale index pointing past the end of a shorter new list.
  useEffect(() => {
    setActiveIndex(0);
  }, [ad?.id, items.length]);

  useEffect(() => {
    if (items.length < 2) return undefined;
    const current = items[activeIndex] || items[0];
    const ms = Math.max(1, Number(current.durationSeconds) || DEFAULT_MANUAL_DURATION_SECONDS) * 1000;
    const timer = setTimeout(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, ms);
    return () => clearTimeout(timer);
  }, [items, activeIndex]);

  if (!ad) return null;

  const size = SIZE_CLASSES[ad.banner_size] || SIZE_CLASSES.normal;

  let displayTitle;
  let displayDescription;
  let displayLogoUrl;
  let displayLogoSize;
  let displayLink;

  if (items.length > 0) {
    const activeItem = items[activeIndex] || items[0];
    displayTitle = activeItem.title;
    displayDescription = activeItem.description;
    displayLogoUrl = activeItem.logoUrl;
    displayLogoSize = activeItem.logoSize;
    displayLink = activeItem.link;
  } else {
    // Resolve translation keys for default/fallback ads
    const resolveText = (text) => (ad.is_translation_key && text ? t(text) : text);
    displayTitle = resolveText(ad.title);
    displayDescription = resolveText(ad.description);
    if (ad.country_content && userCountry) {
      try {
        const cc = JSON.parse(ad.country_content);
        const entry = cc[userCountry];
        if (entry) {
          if (entry.title) displayTitle = entry.title;
          if (entry.description) displayDescription = entry.description;
        }
      } catch {
        // ignore malformed JSON
      }
    }
    // Resolve per-language overrides (takes priority over country)
    if (ad.language_content) {
      try {
        const lc = JSON.parse(ad.language_content);
        const entry = lc[lang];
        if (entry) {
          if (entry.title) displayTitle = entry.title;
          if (entry.description) displayDescription = entry.description;
        }
      } catch {
        // ignore malformed JSON
      }
    }
    displayLogoUrl = ad.logo_url;
    displayLogoSize = ad.logo_size;
    displayLink = ad.link || "/advertise";
  }

  // v3.45 — a merchant carousel item with neither its own ad_link nor a
  // website on file (see buildCarouselItems() above) sets displayLink to
  // null rather than guessing at a destination. That turn is rendered as
  // plain, non-clickable content instead — showing the merchant's
  // logo/name/description exactly as normal, just without a <Link> wrapper
  // — rather than sending the visitor somewhere misleading.
  const content = (
    <>
      {displayLogoUrl && (
        <div className={`${LOGO_SIZE_CLASSES[displayLogoSize] || size.logo} rounded-lg shrink-0 flex items-center justify-center`}>
          <img src={displayLogoUrl} alt={displayTitle} className="w-full h-full object-contain" />
        </div>
      )}
      <div className="flex-1 min-w-0 text-center">
        <p className={`${size.title} font-bold ${ad.text_class || "text-white"} truncate`}>
          {displayTitle}
        </p>
        {displayDescription && (
          <p className={`${size.desc} ${ad.text_class || "text-white"} opacity-90 truncate`}>
            {displayDescription}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      data-ad-region="fishing"
      data-ad-keywords="fishing tackle bait rods"
      className={`relative ${ad.bg_class || "bg-gradient-to-r from-cyan-600 to-blue-600"} rounded-md ${size.wrap} mx-2 my-0.5`}
    >
      {displayLink ? (
        <Link to={displayLink} className="flex items-center gap-3 w-full">
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-3 w-full">{content}</div>
      )}
    </div>
  );
}
