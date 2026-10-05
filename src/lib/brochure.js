import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * downloadInviteBrochure — v2.73. ONE fixed marketing flyer design (the
 * exact reference graphic the trader supplied — golden-fish/angler photo,
 * phone mockups, feature list, "Хвани момента. Запази улова." headline —
 * saved as a static asset at public/brochure-template.jpg) reused unchanged
 * for every water body / commercial venue. The ONLY thing that differs
 * between two brochures is the QR code in the bottom-right badge — each
 * venue/water body downloads with its own `link`
 * (server/routes/merchantReferrals.ts — the id is baked into the link
 * itself, no GPS/location guessing), so every scan is attributable to that
 * one merchant and can earn it free banner-advertising time if the
 * owner/admin has configured a bonus (MerchantBonusEditor.jsx).
 *
 * How it works: the static template is drawn onto an offscreen <canvas> at
 * its native resolution, the template's own QR square is painted over with
 * a fresh white badge in the exact same spot, and this venue's freshly
 * generated QR (with the app's fish icon in the center, matching the
 * template's original badge) is drawn on top of that — everything else in
 * the image is untouched pixels from the same source file, so every
 * brochure is visually identical except that one code. The canvas is then
 * flattened into a single full-bleed image inside a one-page PDF sized to
 * the template's own aspect ratio (no cropping/stretching). Fully
 * client-side — no server round trip beyond the id already encoded in
 * `link`.
 *
 * v2.69–v2.72 explored jsPDF-drawn layouts (plain, then a from-scratch
 * canvas recreation of the reference style) — this replaces both: the
 * trader asked for the reference graphic itself, unchanged, not an
 * approximation of it.
 *
 * v2.80 — the venue/water body's own name is drawn in the empty dark
 * background strip directly above the QR badge (see drawVenueName below),
 * so a trader/admin handing out several brochures can tell them apart
 * without opening each PDF. Uses the CatchCountBrochure custom font
 * (public/fonts/*.ttf) so the added text matches the reference graphic's
 * own "СКАНИРАЙ И ОТВОРИ" label style instead of a generic system font.
 *
 * v3.21 — an optional second line of free text (see drawContactText below),
 * drawn in the template's other empty strip — directly under the existing
 * "Сканирай. Отвори. Лови." caption, bottom-left — for the owner/admin/
 * merchant to add their own contact info before downloading (prompted by
 * src/components/BrochureContactDialog.jsx). Deliberately free text with NO
 * icon drawn next to it and NO forced uppercase/format: the box is offered
 * as "add a phone number" but the trader may just as well want a website, a
 * Facebook page, or a custom label like "За резервация тел.: ...", so the
 * app must not assume it's a phone number and slap a phone glyph in front
 * of whatever they typed.
 *
 * v3.25 — the reference graphic itself (public/brochure-template.jpg) was
 * edited in two ways, at the trader's request: every "Изтегли"/"ИЗТЕГЛИ"
 * ("download") was replaced with "Отвори"/"ОТВОРИ" ("open"), since this is
 * a web app reached by opening a link/QR, not something installed from
 * Google Play/the App Store — "download" was actively misleading. And the
 * "Сканирай. Отвори. Лови." caption was nudged up 24px to leave more room
 * below it (see CONTACT_BASELINE_Y below, moved up by the same amount so
 * the optional contact line keeps the gap it always had beneath that
 * caption). Same "same source file, untouched pixels" approach as always —
 * this is a one-time edit to the shared template asset, not something drawn
 * per-download.
 *
 * v3.72 — resized to a true A5 landscape sheet (210×148mm — requested with
 * a reference mockup, so paper trimmed at that size doesn't cut anything
 * off/leave the flyer undersized on the page). The template's own aspect
 * ratio (1376×768, ≈1.79:1) is narrower than A5's (210:148 ≈1.42:1), so
 * getting to exactly 210×148mm without stretching or cropping the photo
 * means adding height, not changing the existing artwork — see BANNER_H
 * below: a new solid strip is drawn under the untouched template image,
 * filled with the template's own dominant background navy (sampled
 * directly off the source JPG so the seam is invisible) and carrying the
 * venue/water body's name again, large — "текста отдолу копира текста,
 * който е над QR кода" (the site owner's own wording: the bottom text
 * repeats the same name already drawn above the QR badge by
 * drawVenueName, just big enough to read from across a room, the way a
 * printed flyer's own footer banner would).
 *
 * v3.87 — the reference graphic's own baked-in "Сканирай. Отвори. Лови."
 * caption and its "СКАНИРАЙ И ОТВОРИ" QR-corner label were both edited
 * (same one-time, pixel-level asset edit approach as v3.25's own
 * "Изтегли"→"Отвори" pass) to replace "Отвори" with "Регистрирай се" —
 * "QR кода да води към catchcount.app и ... промени [го] във всички
 * рекламни материали". Content-aware fill (OpenCV inpainting) erased the
 * old word cleanly off the real background, then the new word was redrawn
 * with the same CatchCountBrochure-Bold font already used to match this
 * graphic's own type style elsewhere. Every other pixel — icon, the rest
 * of the caption, the whole rest of the photo — is untouched.
 */

const TEMPLATE_URL = "/brochure-template.jpg";
// v3.106 — the poster moved its own big QR (and the pin tag it sits next
// to) down to match the user's reference layout, away from the old small
// corner QR badge baked into this same template.jpg (BADGE_X=1096..1305,
// BADGE_Y=460..669, plus its "СКАНИРАЙ И СЕ РЕГИСТРИРАЙ" caption below it).
// v3.104 had relied on the new big QR fully covering that badge to avoid a
// separate asset; now that the QR sits elsewhere, the badge would show
// through as a second, fake, unscannable QR code. This is the SAME
// template.jpg with just that one spot (badge + its glow + caption)
// smoothed back into the surrounding gradient — nothing else differs (same
// headline, bullets, phones, photo) — used ONLY by renderPosterCanvas. The
// brochure/flyer keep drawing their own real QR directly over the original
// badge position instead (see BADGE_X/Y below), so they still use the
// plain TEMPLATE_URL unchanged.
const POSTER_TEMPLATE_URL = "/brochure-template-poster.jpg";
// v2.91 — exported: reused by src/lib/standingsImage.js so the competition
// standings download shares this same app icon and house font instead of
// loading/registering its own copies.
export const APP_ICON_URL = "/icon-512.png";
const FONT_BOLD_URL = "/fonts/CatchCountBrochure-Bold.ttf";
const TEMPLATE_W = 1376;
const TEMPLATE_H = 768; // the ORIGINAL template image's own height — untouched pixels stop here

// v3.72 — A5 landscape, requested by exact millimeter size. The final
// canvas/PDF page is TEMPLATE_W wide × PAGE_H tall, where PAGE_H is
// TEMPLATE_W scaled to the A5 ratio (not TEMPLATE_H's own 1.79:1 ratio) —
// see the file header comment for why this means ADDING a strip below the
// template rather than stretching or cropping it.
const A5_WIDTH_MM = 210;
const A5_HEIGHT_MM = 148;
const PAGE_H = Math.round(TEMPLATE_W * (A5_HEIGHT_MM / A5_WIDTH_MM));
const BANNER_Y = TEMPLATE_H;
const BANNER_H = PAGE_H - TEMPLATE_H;
// v3.74 — the strip's own fill is not a color at all any more: it's a
// mirrored continuation of the template's own bottom rows — see
// drawBannerBackground below.

// Pixel bounding box of the template's own crisp white QR badge (measured
// directly on the source image with a strict white threshold — v2.73's
// first pass used a looser threshold that also picked up the badge's soft
// glow halo and drop shadow, making the box ~35px too big on every side;
// that both nudged it left into the carp's tail — reading as "overlapping
// the fish" — and left it uneven relative to the glow ring, reading as
// "off-center". This box is square and matches the badge's actual crisp
// edge, so the fresh white rect lands exactly where the template's own QR
// sat, no bigger and no smaller.
const BADGE_X = 1096;
const BADGE_Y = 460;
const BADGE_W = 209;
const BADGE_H = 209;
// v3.75 briefly made these straight-cornered; v3.76 reverts that — the site
// owner clarified they didn't mean to touch anything on the QR badge itself
// ("не съм искал да буташ нищо по QR кода"), so this goes back to its
// original rounded corners.
const BADGE_R = 20;

const QR_PAD = 14;
const ICON_SIZE = 36;
const ICON_BACKING = 44;
const ICON_BACKING_R = 9;

// v2.91 — exported for src/lib/standingsImage.js (see APP_ICON_URL above).
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// v2.91 — exported for src/lib/standingsImage.js (see APP_ICON_URL above).
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed to load: ${src}`));
    img.src = src;
  });
}

// Loaded once per page and cached — every brochure download after the first
// reuses the already-registered font instead of re-fetching the .ttf.
let brochureFontPromise = null;
// v2.91 — exported for src/lib/standingsImage.js (see APP_ICON_URL above) —
// both modules share the same cached load/registration.
export function ensureBrochureFont() {
  if (!brochureFontPromise) {
    brochureFontPromise = (async () => {
      try {
        const font = new FontFace("CatchCountBrochure", `url(${FONT_BOLD_URL})`, { weight: "700" });
        await font.load();
        document.fonts.add(font);
      } catch {
        // Custom font failed to load (unsupported browser, blocked asset,
        // etc.) — drawVenueName() falls back to a generic bold sans-serif
        // below, so the name still renders, just not in the house font.
      }
    })();
  }
  return brochureFontPromise;
}

// Draws `name` centered in the dark, mostly-empty strip directly above the
// QR badge. Auto-shrinks (and, as a last resort, truncates with "…") to fit
// a fixed max width, since venue/water body names are free text of
// unbounded length. Coordinates are hand-measured against the template the
// same way BADGE_* above are: the badge's own top edge sits at BADGE_Y
// (460), the template's "cart" decoration glow ends around y=400.
//
// v2.81 first shipped with NAME_BASELINE_Y = BADGE_Y - 18, measured (via a
// pixel-bbox scan of the rendered canvas) to leave a 12px gap above the
// badge — correct in that measurement, but users reported the name reading
// as touching/overlapping the QR badge in practice (font-rasterization and
// viewing-scale differences eat into a 12px margin fast). Moved up to
// BADGE_Y - 30, which the same bbox-scan method confirmed gives ~24px of
// clearance to the badge while still leaving ~10px above the cart glow.
const NAME_MAX_WIDTH = 320;
const NAME_BASELINE_Y = BADGE_Y - 30;
const NAME_MAX_FONT = 24;
const NAME_MIN_FONT = 13;

function drawVenueName(ctx, name) {
  const label = (name || "").trim().toUpperCase();
  if (!label) return;

  const centerX = BADGE_X + BADGE_W / 2;
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let fontSize = NAME_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  while (fontSize > NAME_MIN_FONT && ctx.measureText(label).width > NAME_MAX_WIDTH) {
    fontSize -= 1;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  let text = label;
  if (ctx.measureText(text).width > NAME_MAX_WIDTH) {
    while (text.length > 1 && ctx.measureText(`${text}…`).width > NAME_MAX_WIDTH) {
      text = text.slice(0, -1);
    }
    text = `${text}…`;
  }

  // Soft dark shadow so the white text stays legible over whatever mix of
  // sky/particle-line background happens to sit behind it.
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, centerX, NAME_BASELINE_Y);
  ctx.restore();
}

// v3.72 — the new A5 footer strip (BANNER_Y..PAGE_H, see the constants
// above): filled with the template's own background navy first (so the
// added height reads as part of the same sheet, not a separate panel), then
// the venue/water body's name again — "текста отдолу копира текста, който е
// над QR кода на търговеца" — same trimmed/uppercased text drawVenueName
// already draws above the QR badge, just large enough to fill most of the
// strip's width, the way a printed flyer's own name banner would. Drawn
// even when `name` is blank (the strip itself still has to exist to keep
// the page at the requested A5 ratio) — it just stays a plain navy band in
// that case, same as the space below the QR badge already looks before any
// name is set.
//
// v3.73 — two refinements the site owner asked for on top of v3.72:
//   1. "Вдигни малко нагоре текста да не е толкова ниско" — the name no
//      longer sits dead-center in the strip; BANNER_TEXT_LIFT pulls it up,
//      leaving more empty space below it than above (same 24px nudge this
//      file already used for CONTACT_BASELINE_Y — see that comment above).
//   2. "в случай, че името... е много дълго, намали малко шрифта и го
//      пренеси на нов ред" — a name that doesn't fit on one line even at
//      BANNER_ONE_LINE_MIN_FONT no longer shrinks further and gets
//      ellipsized; it wraps onto a second line instead (via
//      bestTwoLineSplit, which measures every word-boundary split and picks
//      the one that keeps both lines narrowest), shrinking a bit further if
//      needed down to BANNER_TWO_LINE_MIN_FONT. Ellipsis stays only as a
//      last-resort safety net for a pathological single word too long to
//      fit even at the floor size.
//
// v3.74 — v3.73 filled the strip with a color derived from a single edge
// sample darkened by an arbitrary fixed factor; the site owner didn't like
// that look and asked for the strip to read as a genuine continuation of
// the brochure's own artwork flowing further down. A first attempt at this
// literally mirrored the template's own last ~200px of pixels — but that
// band reaches up into the QR badge and the "Сканирай. Отвори. Лови."
// caption themselves (real content baked into the static template JPG, not
// just background), so the mirror duplicated real text/QR pixels upside
// down into the new strip. Measuring the image directly (pixel variance
// across the full width) shows the template's own artwork is genuinely
// clean, content-free background only from about y≈718 down to its bottom
// edge (767) — and even in that short 49px band it's already darkening
// fast, from a soft glow down to nearly black right at the edge (measured:
// mean luminance ~58 at y=718 down to ~7 at y=767). drawBannerBackground
// below uses that same REAL observed pace: it starts the new strip at the
// template's own actual bottom-edge color (live-sampled, zero-seam) and
// fades it to a deep near-black navy over a comparably short distance, then
// holds that tone for the rest of the strip — i.e. the strip is the
// template's own real vignette, continued at its own real rate, not a
// mirrored duplicate of its content or an arbitrarily-chosen fixed color.
const BANNER_MAX_WIDTH = TEMPLATE_W - 120;
// v3.95 — all four sizes scaled down ~25% from their original v3.72 values
// (96/56/56/26) to free up real vertical room in the strip for the brand
// motto (see drawCatchCountMottoCompact below) at a genuinely readable size,
// instead of a tiny corner line — the user's own explicit choice over
// growing the page past true A5. A short one-line name is still clearly the
// most prominent thing in the strip, just no longer sized to nearly fill it
// edge-to-edge on its own.
const BANNER_MAX_FONT = 72;
const BANNER_ONE_LINE_MIN_FONT = 42;
const BANNER_TWO_LINE_MAX_FONT = 42;
const BANNER_TWO_LINE_MIN_FONT = 20;
const BANNER_LINE_GAP = 1.12; // line-height multiple between the two wrapped lines
const BANNER_TEXT_LIFT = 24; // px raised above the strip's own vertical center

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// Averages the actually-rendered pixel row at the template's own bottom
// edge (y = TEMPLATE_H - 1) so the strip below starts from the EXACT color
// the source artwork ends on — zero seam, and self-correcting if
// brochure-template.jpg is ever swapped for a different photo.
function sampleTemplateEdgeColor(ctx) {
  const { data } = ctx.getImageData(0, TEMPLATE_H - 1, TEMPLATE_W, 1);
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [clamp255(r / n), clamp255(g / n), clamp255(b / n)];
}

// How far into the new strip the fade to near-black completes, before
// holding flat for the rest of the strip's height — chosen to match the
// pace the template's own clean lower band (y≈718–767) already darkens at
// (see the comment above), not an arbitrary distance.
const BANNER_FADE_PX = 60;
// A very dark navy-black (not pure #000, to stay in the same hue family as
// the template's own darkest tone) — the strip's resting color once the
// fade completes, and a stable, high-contrast backdrop for the white name
// text drawn over it afterward.
const BANNER_FLOOR = "rgb(3, 7, 12)";
// v3.105 — a dark BLUE floor (sampled from the reference poster's own
// bottom tone), used instead of BANNER_FLOOR wherever the gradient should
// read as "the same photo's blue fading down" rather than "fading to
// black". Used with fadePx = the full strip height, so there's no flat
// floor segment at all — just one continuous gradient from the template's
// own edge color down to this blue, top to bottom. Shared by all three
// formats (poster, brochure, flyer) for a consistent look.
const BANNER_GRADIENT_FLOOR_BLUE = "rgb(3, 40, 76)";

// Must run AFTER the template has been drawn onto `ctx` and BEFORE any text
// is drawn into the strip. `bannerY`/`bannerH` are explicit (not the module
// A5 constants) as of v3.84 — reused by the new A4 poster's own, much
// taller footer strip (see renderPosterCanvas), which needs the exact same
// seamless-continuation treatment at a different height.
//
// v3.105 — `fadePx`/`floor` are now optional overrides of BANNER_FADE_PX/
// BANNER_FLOOR. The defaults were tuned for the A5/A6 strips (~80–200px
// tall), where fading to near-black within 60px and holding flat for the
// rest reads as a normal dark footer bar. Stretched across the POSTER's own
// much taller strip (POSTER_BANNER_H ≈ 1178px) that same 60px fade left
// ~95% of the page sitting at flat near-black — the trader's own words,
// pasting back our render next to the reference: "каква е тази чернотия в
// долната част?" (what is this blackness at the bottom?) — the reference's
// own background never goes near-black, it stays a rich blue all the way
// down. renderPosterCanvas now passes its own `fadePx = bannerH` (gradient
// runs the FULL height, no flat floor at all) and a blue `floor` instead of
// near-black.
function drawBannerBackground(ctx, bannerY, bannerH, { fadePx = BANNER_FADE_PX, floor = BANNER_FLOOR } = {}) {
  const edgeRgb = sampleTemplateEdgeColor(ctx);
  const fadeStop = Math.min(1, fadePx / bannerH);

  const gradient = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerH);
  gradient.addColorStop(0, `rgb(${edgeRgb.join(", ")})`);
  gradient.addColorStop(fadeStop, floor);
  if (fadeStop < 1) gradient.addColorStop(1, floor);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, bannerY, TEMPLATE_W, bannerH);
  ctx.restore();
}

// v3.76 — drawBannerBackground's own fill (a flat gradient built from an
// AVERAGED edge color) still left a faint but visible seam at y=BANNER_Y:
// the real template row directly above it has pixel-to-pixel variation
// (grain, slight hue drift across the width) that a single averaged color
// can't match everywhere at once, so a thin, visible line remained where
// the real pixels stopped and the flat fill began — exactly what the site
// owner flagged ("не искам да се вижда този ръб... цветовете трябва да
// преливат плавно"). This draws the template's own actual last few rows of
// pixels (not an average — the real image data, grain and all) stretched
// across a short feather zone right at the seam, with their opacity faded
// from fully solid (at y=BANNER_Y, where they're pixel-for-pixel what the
// template already looks like one row up, so there's nothing to see) down
// to fully transparent a little further down (revealing
// drawBannerBackground's fill underneath). Because the top of the feather
// is the real image and not an approximation, there is nothing left for the
// eye to catch — it's a true crossfade, not a color match. Must run after
// both the template and drawBannerBackground have been drawn onto `ctx`.
const SEAM_FEATHER_H = 64; // how far down the crossfade reaches
const SEAM_SLIVER_H = 6; // how many real rows of the template are stretched across it — thin enough to avoid dragging in any JPEG block artifacts from further up

// `bannerY` is explicit as of v3.84 (was the module A5 BANNER_Y constant) —
// see drawBannerBackground's own comment above for why.
function drawSeamFeather(ctx, template, bannerY) {
  const srcY = TEMPLATE_H - SEAM_SLIVER_H;

  const off = document.createElement("canvas");
  off.width = TEMPLATE_W;
  off.height = SEAM_FEATHER_H;
  const octx = off.getContext("2d");
  octx.drawImage(template, 0, srcY, TEMPLATE_W, SEAM_SLIVER_H, 0, 0, TEMPLATE_W, SEAM_FEATHER_H);

  octx.globalCompositeOperation = "destination-in";
  const mask = octx.createLinearGradient(0, 0, 0, SEAM_FEATHER_H);
  mask.addColorStop(0, "rgba(0, 0, 0, 1)");
  mask.addColorStop(1, "rgba(0, 0, 0, 0)");
  octx.fillStyle = mask;
  octx.fillRect(0, 0, TEMPLATE_W, SEAM_FEATHER_H);

  ctx.drawImage(off, 0, bannerY);
}

// Picks the word-boundary split that keeps both resulting lines as close in
// width as possible (measured with ctx's current font), so a multi-word
// name wraps evenly instead of leaving one line nearly empty.
function bestTwoLineSplit(ctx, words) {
  if (words.length < 2) return [words.join(" "), ""];
  let best = [words.join(" "), ""];
  let bestWidest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const widest = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
    if (widest < bestWidest) {
      bestWidest = widest;
      best = [line1, line2];
    }
  }
  return best;
}

function ellipsize(ctx, text, maxWidth) {
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

// v3.74 — text-only now; the strip's background is drawn separately by
// drawBannerBackground above (called earlier, right after the template
// itself — see renderBrochureCanvas), so this just places the name "върху
// определеното място" (over the designated spot) on top of it.
// v3.84 — `opts.centerX`/`opts.maxWidth` let a caller shift the name aside
// to make room for the new logo card (see drawLogoCard below) without
// touching the default, still-centered-full-width layout that every
// existing brochure (the overwhelming majority — a logo is a new, optional
// field) keeps using unchanged.
function drawNameBanner(ctx, name, opts = {}) {
  const label = (name || "").trim().toUpperCase();
  if (!label) return;

  const centerX = opts.centerX ?? TEMPLATE_W / 2;
  const maxWidth = opts.maxWidth ?? BANNER_MAX_WIDTH;
  const centerY = BANNER_Y + BANNER_H / 2 - BANNER_TEXT_LIFT;
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";

  // Single line first, shrinking down to BANNER_ONE_LINE_MIN_FONT.
  let fontSize = BANNER_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  while (fontSize > BANNER_ONE_LINE_MIN_FONT && ctx.measureText(label).width > maxWidth) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  if (ctx.measureText(label).width <= maxWidth) {
    ctx.fillText(label, centerX, centerY);
    ctx.restore();
    return;
  }

  // Doesn't fit on one line even at the smallest single-line size — wrap
  // onto two lines instead of ellipsizing, shrinking further if needed.
  const words = label.split(/\s+/).filter(Boolean);
  fontSize = BANNER_TWO_LINE_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  let lines = bestTwoLineSplit(ctx, words);
  while (
    fontSize > BANNER_TWO_LINE_MIN_FONT &&
    (ctx.measureText(lines[0]).width > maxWidth || ctx.measureText(lines[1]).width > maxWidth)
  ) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    lines = bestTwoLineSplit(ctx, words);
  }

  // Still too wide at the floor size (a pathological single long word) —
  // ellipsize whichever line overflows, same safety net used elsewhere in
  // this file.
  lines = lines.map((line) =>
    ctx.measureText(line).width > maxWidth ? ellipsize(ctx, line, maxWidth) : line
  );

  const lineHeight = fontSize * BANNER_LINE_GAP;
  ctx.fillText(lines[0], centerX, centerY - lineHeight / 2);
  if (lines[1]) ctx.fillText(lines[1], centerX, centerY + lineHeight / 2);
  ctx.restore();
}

// Draws the optional free-text contact line, left-aligned, in the empty
// dark strip below the template's own "Сканирай. Отвори. Лови." caption
// (that caption's icon sits at x=73, y≈666-701; the strip below it, y≈700-
// 768, is empty background across the full width of the template — measured
// directly on the source image the same way BADGE_*/NAME_* above were).
// Left-aligned (not centered like the venue name) so it reads as a
// continuation of the caption line above it, and capped well short of the
// QR badge (BADGE_X = 1096) so a long line never runs into it.
//
// v3.25 — the template asset itself was edited: "Изтегли"/"ИЗТЕГЛИ" was
// replaced with "Отвори"/"ОТВОРИ" everywhere in the graphic (the app is a
// web app, not something installed from Google Play/App Store, so
// "download" was misleading — the QR just opens it), and the caption line
// was moved up 24px (icon+text top 682→658, baseline 716→692) to leave more
// breathing room at the bottom edge. CONTACT_BASELINE_Y moves up by the same
// 24px so this line keeps the same visual gap below the caption it always
// had (they read as one continuous two-line block, so they had to move
// together, not just the caption alone).
const CONTACT_X = 73;
const CONTACT_BASELINE_Y = 728;
const CONTACT_MAX_WIDTH = 950;
const CONTACT_MAX_FONT = 24;
const CONTACT_MIN_FONT = 13;

// v3.100 — "на мястото на червената зона трябва да може да се добавя
// свободния текст... на два реда подравнен с текста над него, като не
// застъпва картинката на рибата": this free-text line used to only ever
// shrink to fit on ONE line (down to CONTACT_MIN_FONT, then ellipsize) —
// fine for a short phone number, but a longer address/website/combined
// line either came out tiny or got cut off with "…". It now falls back to
// TWO lines, same left edge as the caption above it (CONTACT_X=73, so it
// keeps reading as a continuation of that line, not a separate block), only
// when the text genuinely doesn't fit on one line even at the smallest
// single-line size — short text (the common case: a single phone number or
// short URL) renders exactly as before, unchanged. CONTACT_MAX_WIDTH=950
// is untouched, so both the one-line and two-line paths stay just as clear
// of the QR badge (BADGE_X=1096) and of the carp's silhouette in this lower
// strip as the original single-line version always was — confirmed empty
// background there up to that width on the source template.
const CONTACT_2L_MAX_FONT = 19;
const CONTACT_2L_MIN_FONT = 12;
const CONTACT_2L_LINE1_Y = 722;
const CONTACT_2L_LINE_GAP = 25; // line2 baseline = 747, still 21px clear of the photo's own bottom edge (768)

function drawContactText(ctx, contactText, maxWidth = CONTACT_MAX_WIDTH) {
  // Free text, as typed — no trim-to-empty-only-check beyond whitespace, no
  // uppercasing (unlike drawVenueName): this may be a URL or a Facebook
  // handle, both case-sensitive, not just a name.
  const text = (contactText || "").trim();
  if (!text) return;

  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";

  // Try the original one-line treatment first, shrinking down to
  // CONTACT_MIN_FONT.
  let fontSize = CONTACT_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  while (fontSize > CONTACT_MIN_FONT && ctx.measureText(text).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, CONTACT_X, CONTACT_BASELINE_Y);
    ctx.restore();
    return;
  }

  // Doesn't fit on one line even at the smallest single-line size — wrap
  // onto two lines instead of just ellipsizing, shrinking further if
  // needed, same balanced-split approach drawNameBanner/drawPosterName use
  // for the venue name (bestTwoLineSplit picks whichever split point keeps
  // the widest of the two lines narrowest — works just as well for free
  // text as for a name).
  const words = text.split(/\s+/).filter(Boolean);
  fontSize = CONTACT_2L_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  let lines = bestTwoLineSplit(ctx, words);
  while (
    fontSize > CONTACT_2L_MIN_FONT &&
    (ctx.measureText(lines[0]).width > maxWidth || ctx.measureText(lines[1]).width > maxWidth)
  ) {
    fontSize -= 1;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    lines = bestTwoLineSplit(ctx, words);
  }

  // Still too wide at the floor size (e.g. one pathologically long word/URL
  // with no spaces to split on) — ellipsize whichever line overflows, same
  // safety net as the one-line path always had.
  lines = lines.map((line) => (ctx.measureText(line).width > maxWidth ? ellipsize(ctx, line, maxWidth) : line));

  ctx.fillText(lines[0], CONTACT_X, CONTACT_2L_LINE1_Y);
  if (lines[1]) ctx.fillText(lines[1], CONTACT_X, CONTACT_2L_LINE1_Y + CONTACT_2L_LINE_GAP);
  ctx.restore();
}

// v3.84 — like loadImage above, but resolves `null` instead of rejecting on
// failure. Used only for the venue/water-body's own uploaded logo: it's an
// optional, best-effort addition to the brochure/poster, and a missing or
// broken logo_url must never break the rest of the download.
function loadImageSafe(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// v3.84 — draws the venue/water body's own uploaded logo (TraderVenues.jsx /
// WaterBodyManagement.jsx logo_url) on a small rounded card, scaled and
// centered the same way CSS `object-fit: contain` already displays this
// same logo everywhere else in the app (venue lists, ad banners) — never
// distorted, never cropped. A plain solid card rather than trying to blend
// the logo's own pixels into the dark background: most uploaded logos have
// a solid-color background of their own, and a real alpha blend would often
// make them unreadable or muddy; a clean card is how this exact logo is
// already presented throughout the rest of the app, so it stays consistent.
// No-op if `logoImg` is null — missing logo, or it failed to load.
//
// v3.91 — the card's own background is now configurable ("Искам да мога да
// задавам цвета на фона на логото в брошурата"), via `bgColor`
// (`water_bodies.logo_bg_color` / `venues.logo_bg_color`, picked in
// WaterBodyEditDialog.jsx/TraderVenues.jsx — see LOGO_BG_COLORS below for
// the preset list shown there). Defaults to the original white when no
// color is set, so every existing water body/venue (NULL column) keeps
// its exact prior look with no migration-day visual change. The special
// value `"transparent"` skips the rounded card entirely — no fill, no
// shadow, just the logo image drawn straight onto the brochure's own dark
// background — for a logo that's already a vector/PNG with its own
// transparent background and doesn't need (or want) a card under it.
export const LOGO_BG_COLORS = [
  { value: "#ffffff", key: "white" },
  { value: "#e2e8f0", key: "lightGray" },
  { value: "#0b3554", key: "navy" },
  { value: "#000000", key: "black" },
  { value: "transparent", key: "transparent" },
];

// v3.92 — the card's own SIZE is now also configurable ("Увеличи размера на
// логото в брошурата... не е подравнено с текста и няма симетрия"), via
// `logoScale` (`water_bodies.brochure_logo_size` / `venues.brochure_logo_size`
// — a DIFFERENT column from the existing `logo_size` enum above, which only
// ever sized this same logo inside an AD BANNER; this one is the printable
// brochure/poster card). Three fixed steps rather than a free slider — each
// one pre-checked (see A5_LOGO_SCALES/POSTER_LOGO_SCALES below) to still fit
// cleanly inside its footer strip without colliding with the name banner or,
// on the poster, the big QR code below it. "normal" is the exact size this
// card has always been, so every existing water body/venue (NULL column)
// keeps its prior look.
export const LOGO_SCALES = [
  { value: "normal", key: "normal" },
  { value: "large", key: "large" },
  { value: "xlarge", key: "xlarge" },
];

// v3.104 — "искам логото да може да е по-голямо (самото лого, а не полето
// на логото)": the card itself (LOGO_SCALES/A5_LOGO_SCALES/
// POSTER_LOGO_SCALES) already has size presets the merchant picks from —
// what was actually capping the LOGO graphic inside a given card was this
// padding, unchanged since the very first version. Shrunk from 16 to 6 so
// the logo itself fills noticeably more of its card at every scale/format,
// without changing the card's own footprint (position math elsewhere stays
// untouched).
const LOGO_CARD_PAD = 6;
const LOGO_CARD_R = 18;

function drawLogoCard(ctx, logoImg, centerX, topY, maxW, maxH, bgColor = "#ffffff") {
  if (!logoImg) return;

  if (bgColor !== "transparent") {
    ctx.save();
    roundRectPath(ctx, centerX - maxW / 2, topY, maxW, maxH, LOGO_CARD_R);
    ctx.fillStyle = bgColor || "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();
  }

  const innerW = maxW - LOGO_CARD_PAD * 2;
  const innerH = maxH - LOGO_CARD_PAD * 2;
  const naturalW = logoImg.naturalWidth || logoImg.width || 1;
  const naturalH = logoImg.naturalHeight || logoImg.height || 1;
  const scale = Math.min(innerW / naturalW, innerH / naturalH);
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  ctx.drawImage(logoImg, centerX - drawW / 2, topY + LOGO_CARD_PAD + (innerH - drawH) / 2, drawW, drawH);
}

// v3.84 — CatchCount's OWN fixed contact line, requested to appear on every
// single brochure and poster, unconditionally — distinct from
// drawContactText above, which draws the venue/water body's own OPTIONAL,
// freely-typed contact info. This one is never editable, never empty, and
// never omitted: whoever ends up holding a printed flyer or poster can
// always reach CatchCount directly, not just the venue it was handed out
// for.
// v3.87 — exported: src/pages/ContactUs.jsx ("Връзка с нас") also shows
// these same three values directly, so both places read from one source
// instead of the phone/email being retyped (and risking drifting apart) in
// two files.
export const CATCHCOUNT_APP_LABEL = "catchcount.app";
export const CATCHCOUNT_PHONE = "+359 894 31 88 33";
export const CATCHCOUNT_EMAIL = "catch.count.bg@gmail.com";

// v3.93 — the brand's own short tagline, requested to appear somewhere on
// the promotional materials, same spirit as the fixed contact line above
// (never translated — a fixed Bulgarian/brand line, not venue content).
// "CatchCount" is drawn in the brand's own teal accent (sampled from the app
// icon itself — see drawCatchCountMotto below), the rest in white, mirroring
// the two-tone treatment the reference image showed.
export const CATCHCOUNT_MOTTO_PREFIX = "Всеки риболов разказва нещо. ";
export const CATCHCOUNT_MOTTO_BRAND = "CatchCount";
export const CATCHCOUNT_MOTTO_SUFFIX = " го помни.";
const CATCHCOUNT_MOTTO_ACCENT = "#5eead4";

// One centered line, "CatchCount" itself in the accent color, everything
// else in white — used only where there's genuine spare vertical room (see
// its one call site in renderPosterCanvas for why the A5 brochure and A6
// flyer don't also get this: both footer strips are already at the tightest
// size several earlier rounds of "shrink it" feedback left them at).
function drawCatchCountMotto(ctx, anchorX, y, { font = 26, maxWidth = TEMPLATE_W - 80, align = "center" } = {}) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // v3.104 — bumped up to 46px on the poster ("по-едър стилизиран шрифт")
  // made this line wide enough to run off the canvas edge at the full-size
  // greeting. Shrink-to-fit, same pattern as drawVenueName/drawContactText
  // elsewhere in this file, so a bigger `font` request never overflows.
  let fontSize = font;
  const measure = () => {
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    return (
      ctx.measureText(CATCHCOUNT_MOTTO_PREFIX).width +
      ctx.measureText(CATCHCOUNT_MOTTO_BRAND).width +
      ctx.measureText(CATCHCOUNT_MOTTO_SUFFIX).width
    );
  };
  while (fontSize > 14 && measure() > maxWidth) fontSize -= 1;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;

  const w1 = ctx.measureText(CATCHCOUNT_MOTTO_PREFIX).width;
  const w2 = ctx.measureText(CATCHCOUNT_MOTTO_BRAND).width;
  const w3 = ctx.measureText(CATCHCOUNT_MOTTO_SUFFIX).width;
  const totalW = w1 + w2 + w3;
  // v3.106 — `align` lets callers anchor this block by its left or right
  // edge instead of always centering it on `anchorX` — the poster's own
  // bottom block and the A5 brochure's compact redesign both now read
  // left-to-right from a fixed left margin (matching the reference image),
  // not centered on the page.
  let x = align === "left" ? anchorX : align === "right" ? anchorX - totalW : anchorX - totalW / 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillText(CATCHCOUNT_MOTTO_PREFIX, x, y);
  x += w1;

  ctx.fillStyle = CATCHCOUNT_MOTTO_ACCENT;
  ctx.fillText(CATCHCOUNT_MOTTO_BRAND, x, y);
  x += w2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillText(CATCHCOUNT_MOTTO_SUFFIX, x, y);
  ctx.restore();
}

// Two centered lines — used by the new A4 poster, which has the vertical
// room for it. See drawCatchCountFooterCompact below for the A5 brochure's
// own, single-line version (its footer strip is far shorter).
function drawCatchCountFooter(ctx, centerX, appY, detailY, { appFont = 30, detailFont = 22 } = {}) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;

  ctx.font = `700 ${appFont}px ${fontStack}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(CATCHCOUNT_APP_LABEL, centerX, appY);

  ctx.font = `700 ${detailFont}px ${fontStack}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(`${CATCHCOUNT_PHONE}   ·   ${CATCHCOUNT_EMAIL}`, centerX, detailY);
  ctx.restore();
}

// Compact single line, right-aligned in the A5 brochure's own short footer
// strip (BANNER_H is only ~202px, already carrying the venue name at up to
// 96px font — see drawNameBanner) — tucked into the bottom-right corner,
// below and clear of the centered name in every case (the name's own
// vertical band, lifted by BANNER_TEXT_LIFT, never reaches this close to
// the strip's bottom edge).
// v3.107 — two changes:
//   1. Bottom margin up from 14 to 22 — "повдигни текста нагоре... да
//      остане повече място отдолу, тъй като е проблем при рязането": at
//      14px this line sat almost exactly on the page's physical trim edge,
//      no safety margin for a real print cut.
//   2. The new Facebook/Instagram handles ("Добави и фейсбук страницата и
//      страницата в инстаграм") are appended to this SAME line instead of
//      becoming their own row. A real test case — a long two-line venue
//      name with an xlarge logo (the same name the site owner's own
//      reference screenshot used) only leaves about 80px of strip height
//      below the name; a genuine extra icon row there either collided with
//      the name or forced the bottom margin back down below its old 14px,
//      defeating the point of raising it. One more clause on the existing
//      plain-text line costs no extra vertical space at all.
const A5_FOOTER_RIGHT_MARGIN = 30;
const A5_FOOTER_BOTTOM_MARGIN = 22;
const A5_FOOTER_FONT = 16;

function drawCatchCountFooterCompact(ctx) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const text =
    `${CATCHCOUNT_APP_LABEL}  ·  ${CATCHCOUNT_PHONE}  ·  ${CATCHCOUNT_EMAIL}  ·  ` +
    `IG ${CATCHCOUNT_INSTAGRAM}  ·  FB ${CATCHCOUNT_FACEBOOK}`;
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${A5_FOOTER_FONT}px ${fontStack}`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(text, TEMPLATE_W - A5_FOOTER_RIGHT_MARGIN, PAGE_H - A5_FOOTER_BOTTOM_MARGIN);
  ctx.restore();
}

// v3.94 — the brand motto's own compact, single-line form, right-aligned
// directly above the footer line, same right margin. Unlike the venue name
// banner — which can span the full width and run close to this corner on a
// long one-line name — this line only ever has to clear the LOGO CARD
// vertically, and the two never actually overlap horizontally (the card
// sits at the strip's far left, A5_LOGO_CARD_X=73, while this stays
// right-aligned) regardless of the card's own scale.
// v3.95 — sized up from 13px to a genuinely visible 24px (the user's own
// call: "не трябва да е малък ред в ъгъла... по-голям шрифт" — it shouldn't
// be a small line in the corner), made possible by BANNER_MAX_FONT etc.
// shrinking above — the user's own explicit choice of trade-off over
// growing the page past true A5.
// v3.107 — bumped again, 24 → 28 ("увеличи още малко шрифта на мотото").
// Deliberately not bumped further than this: with a long two-line venue
// name (drawNameBanner can run up to 887px down from the strip's own top in
// the xlarge-logo case), there genuinely isn't room for much more here
// without this line running into the name above it — verified against that
// exact case via the QA render, not just measured on paper.
const A5_MOTTO_FONT = 28;
const A5_MOTTO_GAP = 32; // baseline-to-baseline distance up from the footer line below it

function drawCatchCountMottoCompact(ctx) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const y = PAGE_H - A5_FOOTER_BOTTOM_MARGIN - A5_MOTTO_GAP;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${A5_MOTTO_FONT}px ${fontStack}`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 4;

  const w1 = ctx.measureText(CATCHCOUNT_MOTTO_PREFIX).width;
  const w2 = ctx.measureText(CATCHCOUNT_MOTTO_BRAND).width;
  const w3 = ctx.measureText(CATCHCOUNT_MOTTO_SUFFIX).width;
  let x = TEMPLATE_W - A5_FOOTER_RIGHT_MARGIN - (w1 + w2 + w3);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(CATCHCOUNT_MOTTO_PREFIX, x, y);
  x += w1;

  ctx.fillStyle = CATCHCOUNT_MOTTO_ACCENT;
  ctx.fillText(CATCHCOUNT_MOTTO_BRAND, x, y);
  x += w2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillText(CATCHCOUNT_MOTTO_SUFFIX, x, y);
  ctx.restore();
}

// v3.84 — where the A5 brochure's logo card sits (top-left of the short
// footer strip) and how much width it reserves so drawNameBanner's own
// centered name shifts right to make room instead of overlapping it — see
// drawNameBanner's `opts` parameter above.
// v3.87 — enlarged (~25%) at the site owner's request ("направи логото на
// брошурата малко по-голямо"). Still comfortably clear of the strip's own
// top/bottom edges (BANNER_H=202 vs the card's 100px height, centered) and
// of drawCatchCountFooterCompact's text in the bottom-right corner.
// v3.92 — TWO fixes requested together ("не е подравнено с текста и няма
// симетрия"):
//   1. X moved from 30 to 73 — that's CONTACT_X, the SAME left margin the
//      template's own feature-icon column and the optional contact line use
//      directly above this strip. The card used to sit adrift at its own
//      arbitrary margin; it now continues that same vertical line, which is
//      what actually reads as "aligned" here.
//   2. The card is no longer centered on the strip's own full BANNER_H
//      band — it's centered on the exact same centerY drawNameBanner uses
//      (BANNER_TEXT_LIFT raises the name 24px above true-center, so a card
//      centered on the FULL band sat 24px lower than the name it's supposed
//      to sit level with). Computed once below as A5_LOGO_CENTER_Y so both
//      drawNameBanner's reserved-width math and drawLogoCard's own topY stay
//      in sync by construction instead of as two numbers someone has to
//      remember to keep matching.
// Three selectable sizes (v3.92, "мога да задавам... размера на логото") —
// see LOGO_SCALES above for the picker. Each ceiling here is hand-checked
// against A5_LOGO_CENTER_Y below: even xlarge's 145px height keeps the card
// a few px clear of the strip's own top edge.
const A5_LOGO_CARD_X = 73;
const A5_LOGO_GAP = 50; // breathing room between the card's right edge and the name's own reserved zone
const A5_LOGO_SCALES = {
  normal: { w: 160, h: 100 },
  large: { w: 215, h: 125 },
  xlarge: { w: 270, h: 145 },
};
function getA5LogoDims(logoScale) {
  return A5_LOGO_SCALES[logoScale] || A5_LOGO_SCALES.normal;
}
const A5_LOGO_CENTER_Y = BANNER_Y + BANNER_H / 2 - BANNER_TEXT_LIFT; // same centerY drawNameBanner's text uses

// ─── A4 portrait poster (v3.84) ─────────────────────────────────────────
// A separate downloadable sheet for merchants/water bodies to print and
// hang up, "да наподобява брошурите" (to resemble the brochures) — so it
// reuses the exact same top artwork (public/brochure-template.jpg,
// untouched) and the same visual language (font, QR badge style, gradient
// footer strip) as renderBrochureCanvas above, just built around A4
// portrait's much taller aspect ratio (210×297mm, vs A5 landscape's
// 210×148mm) instead of a short footer strip: the template's own width
// stays TEMPLATE_W (1376px, matching its native resolution, so the photo
// itself is never stretched/cropped), and the extra height all goes into
// one tall footer strip below it, stacked top-to-bottom with the venue
// name (repeated, large — same as the A5 banner), the venue's own logo (if
// any), a big primary QR code (sized for scanning from a few steps back —
// the brochure's own corner badge, kept below for visual consistency, is
// too small for that), and CatchCount's own fixed contact line.
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const POSTER_PAGE_H = Math.round(TEMPLATE_W * (A4_HEIGHT_MM / A4_WIDTH_MM));
const POSTER_BANNER_Y = TEMPLATE_H; // same top photo as the brochure, unchanged
const POSTER_BANNER_H = POSTER_PAGE_H - TEMPLATE_H;
// v3.105 — see BANNER_GRADIENT_FLOOR_BLUE above: the poster's footer now
// fades the FULL height (fadePx = POSTER_BANNER_H) into that blue, not the
// near-black BANNER_FLOOR, to kill the dead near-black zone the user
// flagged ("каква е тази чернотия в долната част?").

// v3.92 — three selectable sizes (see LOGO_SCALES/A5_LOGO_SCALES above).
// v3.101 — the card moved from centered to bottom-left (see
// POSTER2_LOGO_X/logoY below), so these are now just w/h, not also an
// implicit centered position.
const POSTER_LOGO_SCALES = {
  normal: { w: 340, h: 170 },
  large: { w: 400, h: 195 },
  xlarge: { w: 450, h: 210 },
};
function getPosterLogoDims(logoScale) {
  return POSTER_LOGO_SCALES[logoScale] || POSTER_LOGO_SCALES.normal;
}

// v3.106 — shrunk from 480: at that size, covering the old hero badge
// forced POSTER2_QR_Y up into the photo itself (see the removed comment
// below), which is exactly what the user flagged as "не е на мястото си"
// (not in the right place). Measured off the user's own reference image
// (reference_v2.jpg, 1055×1491): the big QR card there is ≈290px square
// out of a 1491px-tall page — scaled to our POSTER_PAGE_H, that's ≈380.
const POSTER_QR_SIZE = 380;
const POSTER_QR_R = 28;

// ─── v3.101: poster footer visual refresh ──────────────────────────────
// "Генерирай наново в този стил" — the trader supplied a reference layout
// (pin-shaped name tag, logo bottom-left, QR right-aligned with its own
// label, single-row contact line with icons, social-media row) for a
// redesign of this footer strip. No image-generation tool is available
// this session, so the hero photo above (the woman holding the fish,
// drawVenueName/drawContactText, the small corner QR badge further down in
// this file) is deliberately UNCHANGED — everything below is built from
// plain canvas shapes/text around that same, untouched photo, not a new
// illustration. See claude/ project notes for the fuller writeup.
const PIN_TAG_BG = "#0b3554"; // same navy as the QR modules' own dark color
const POSTER2_MARGIN_X = 70;

const POSTER2_PIN_TAG_X = POSTER2_MARGIN_X;
const POSTER2_PIN_TAG_TOP = POSTER_BANNER_Y + 70;
const POSTER2_PIN_TAG_MAX_WIDTH = 700;

// v3.106 — "QR кода на постера не е на мястото си": v3.104's fix moved the
// QR UP into the photo itself (POSTER2_QR_Y=380) to cover the old hero
// badge. That solved the duplicate-QR problem but put the QR nowhere near
// where the user's own reference image puts it. Measured off that
// reference (reference_v2.jpg): the pin tag and the big QR sit side by
// side, at roughly the SAME height, just below the photo — not one buried
// inside the photo and the other far below it. POSTER2_QR_Y now starts
// just above POSTER2_PIN_TAG_TOP so the two visually form one row, same as
// the reference.
const POSTER2_QR_Y = POSTER_BANNER_Y + 40;
const POSTER2_QR_X = TEMPLATE_W - 30 - POSTER_QR_SIZE;
const POSTER2_QR_LABEL_GAP = 20;
const POSTER2_QR_LABEL_H = 58; // matches drawQrLabelPill's own fixed `h`

const POSTER2_LOGO_X = POSTER2_MARGIN_X;
const POSTER2_LOGO_GAP_BELOW_TAG = 40;
const POSTER2_DIVIDER_WIDTH = 760;

// v3.106 — the bottom block (motto/contact/social) now reads left-to-right
// from this same left margin instead of being centered on the page — see
// renderPosterCanvas below. Matches the reference image, where none of
// logo/motto/contact/social sit centered.
const POSTER2_BOTTOM_BLOCK_X = POSTER2_MARGIN_X;

// v3.101 — fixed app-wide social handles, same spirit as
// CATCHCOUNT_APP_LABEL/PHONE/EMAIL above: identical on every poster, not
// something a merchant sets. Taken directly off the reference layout
// supplied.
export const CATCHCOUNT_INSTAGRAM = "CatchCount.app";
export const CATCHCOUNT_FACEBOOK = "CatchCount";

// Plain line-art glyphs for the rows below — there's no existing
// vector-icon style in this file to match (the feature-list icons on the
// template itself are baked pixels, not drawn), so these are new,
// deliberately simple shapes: legible at footer size and consistent with
// each other, not an attempt to reproduce any platform's exact logo
// artwork.
function drawPinIcon(ctx, cx, cy, size) {
  const r = size * 0.34;
  const circleCy = cy - size * 0.12;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, circleCy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.82, circleCy + r * 0.55);
  ctx.lineTo(cx, cy + size * 0.5);
  ctx.lineTo(cx + r * 0.82, circleCy + r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PIN_TAG_BG;
  ctx.beginPath();
  ctx.arc(cx, circleCy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlobeIcon(ctx, cx, cy, size) {
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.restore();
}

function drawPhoneIcon(ctx, cx, cy, size) {
  // Old-style "handset" silhouette — two rounded blobs joined by a bar,
  // tilted, filled solid rather than outlined (reads better at small size).
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, -size * 0.1, -size * 0.5, size * 0.2, size * 0.32, size * 0.1);
  ctx.fill();
  roundRectPath(ctx, -size * 0.1, size * 0.18, size * 0.2, size * 0.32, size * 0.1);
  ctx.fill();
  roundRectPath(ctx, -size * 0.06, -size * 0.22, size * 0.12, size * 0.44, size * 0.06);
  ctx.fill();
  ctx.restore();
}

function drawEnvelopeIcon(ctx, cx, cy, size) {
  const w = size;
  const h = size * 0.68;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.lineJoin = "round";
  roundRectPath(ctx, x, y, w, h, size * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.04, y + size * 0.04);
  ctx.lineTo(cx, cy + h * 0.14);
  ctx.lineTo(x + w - size * 0.04, y + size * 0.04);
  ctx.stroke();
  ctx.restore();
}

function drawInstagramIcon(ctx, cx, cy, size) {
  const half = size / 2;
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  roundRectPath(ctx, cx - half, cy - half, size, size, size * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + half * 0.55, cy - half * 0.55, size * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

function drawFacebookIcon(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PIN_TAG_BG;
  ctx.font = `700 ${Math.round(size * 0.68)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("f", cx, cy + size * 0.04);
  ctx.restore();
}

// Pin-shaped name badge, replacing the old plain centered drawPosterName.
// Returns the Y just below the drawn box (or `topY` unchanged if there's no
// name to show) so the caller can stack the logo under it without a fixed,
// hand-tuned gap that would break on a long, 3-line name.
// v3.106 — `scale` shrinks pad/iconSize/the starting font size together
// (same pattern as drawIconRow's own `scale`), so the A5 brochure's compact
// redesign can reuse this exact pill instead of a separate smaller
// implementation. `x`/`topY` stay the pill's top-left corner either way —
// UNLESS `centerY` is passed, in which case `topY` is ignored and the pill
// is vertically centered on `centerY` instead, using its own actual boxH
// (which depends on how many lines the name wraps to — 1 to 3 — so this is
// the only way to center it correctly; a caller guessing boxH ahead of
// time to center it externally will get it wrong for anything but the
// 1-line case, which is exactly the bug this option exists to avoid).
function drawVenuePinTag(ctx, x, topY, maxWidth, name, { scale = 1, centerY } = {}) {
  const label = (name || "").trim().toUpperCase();
  if (!label) return topY;

  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const pad = 28 * scale;
  const iconSize = 56 * scale;
  const iconGap = 20 * scale;
  const textMaxWidth = maxWidth - pad * 2 - iconSize - iconGap;
  const words = label.split(/\s+/).filter(Boolean);

  ctx.save();

  function wrap(fontSize) {
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (!cur || ctx.measureText(test).width <= textMaxWidth) {
        cur = test;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  let fontSize = 34 * scale;
  let lines = wrap(fontSize);
  while (lines.length > 3 && fontSize > 18 * scale) {
    fontSize -= 2;
    lines = wrap(fontSize);
  }
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    lines[2] = ellipsize(ctx, lines[2], textMaxWidth);
  }

  const lineGap = fontSize * 1.22;
  const textBlockH = lines.length * lineGap;
  const boxH = Math.max(iconSize + pad * 1.3, textBlockH + pad * 1.6);
  if (centerY !== undefined) topY = centerY - boxH / 2;

  roundRectPath(ctx, x, topY, maxWidth, boxH, boxH / 2.6);
  ctx.fillStyle = PIN_TAG_BG;
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fill();
  ctx.shadowColor = "transparent";

  drawPinIcon(ctx, x + pad + iconSize / 2, topY + boxH / 2, iconSize);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  ctx.fillStyle = "#ffffff";
  const textX = x + pad + iconSize + iconGap;
  const firstBaseline = topY + boxH / 2 - textBlockH / 2 + fontSize * 0.88;
  lines.forEach((line, i) => ctx.fillText(line, textX, firstBaseline + i * lineGap));

  ctx.restore();
  return topY + boxH;
}

// Purely decorative dashed connector from the name tag to the QR code,
// mirroring the reference layout's own curved arrow.
function drawDashedConnector(ctx, x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  const midY = y1 + (y2 - y1) * 0.15;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(midX, midY, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = Math.atan2(y2 - midY, x2 - midX);
  const ah = 11;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle - 0.4), y2 - ah * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - ah * Math.cos(angle + 0.4), y2 - ah * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fill();
  ctx.restore();
}

// v3.102 — a dashed flow-arrow sweeping over the three phone mockups in the
// hero photo, echoing the reference design's GPS-phone→map-phone arrow. We
// have no map-screen phone to anchor it to, so instead it sweeps from the
// session/timer phone, over the calendar phone, ending at the catch-log
// phone — same "track → plan → log your catch" idea, same three phones.
// Shared by all three formats since they all draw the untouched template at
// the same TEMPLATE_W × TEMPLATE_H coordinates.
function drawPhoneFlowArrow(ctx) {
  const x1 = 1089, y1 = 113;
  const x2 = 1229, y2 = 92;
  const controlX = 1159, controlY = 4;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(controlX, controlY, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = Math.atan2(y2 - controlY, x2 - controlX);
  const ah = 11;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle - 0.4), y2 - ah * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - ah * Math.cos(angle + 0.4), y2 - ah * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fill();
  ctx.restore();
}

// The pill label under the QR ("СКАНИРАЙ И СЕ РЕГИСТРИРАЙ"), replacing the
// corner badge's own baked-in version of this same label for the big
// poster QR specifically.
function drawQrLabelPill(ctx, centerX, y, maxWidth) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const text = "СКАНИРАЙ И СЕ РЕГИСТРИРАЙ";
  const h = 58;
  const hPad = 28;

  ctx.save();
  let fontSize = 24;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  while (fontSize > 14 && ctx.measureText(text).width > maxWidth - hPad * 2) {
    fontSize -= 1;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  roundRectPath(ctx, centerX - maxWidth / 2, y, maxWidth, h, h / 2);
  ctx.fillStyle = "rgba(11, 53, 84, 0.85)";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, centerX, y + h / 2 + 1);
  ctx.restore();
}

// Shared layout engine for the two icon rows below (contact info, social
// media) — same "icon, gap, text, gap, divider, gap" pattern for each item.
// v3.106 — `align` (default "center", same as before) lets callers anchor
// the row by its left or right edge instead — used by the poster's now
// left-aligned bottom block and the A5 brochure's compact redesign.
function drawIconRow(ctx, anchorX, y, items, { fontSize = 26, align = "center" } = {}) {
  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const gapIconText = 13 * (fontSize / 26);
  const groupGap = 32 * (fontSize / 26);
  const dividerW = 2;

  ctx.save();
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  const widths = items.map((it) => it.iconSize + gapIconText + ctx.measureText(it.text).width);
  const totalW =
    widths.reduce((a, b) => a + b, 0) + (items.length - 1) * (groupGap * 2 + dividerW);

  let x = align === "left" ? anchorX : align === "right" ? anchorX - totalW : anchorX - totalW / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 5;

  items.forEach((it, i) => {
    it.icon(ctx, x + it.iconSize / 2, y - fontSize * 0.35, it.iconSize);
    ctx.fillText(it.text, x + it.iconSize + gapIconText, y);
    x += widths[i];
    if (i < items.length - 1) {
      x += groupGap;
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = dividerW;
      ctx.beginPath();
      ctx.moveTo(x, y - fontSize * 0.9);
      ctx.lineTo(x, y + fontSize * 0.25);
      ctx.stroke();
      ctx.restore();
      x += dividerW + groupGap;
    }
  });
  ctx.restore();
}

function drawIconContactRow(ctx, anchorX, y, { scale = 1, align = "center" } = {}) {
  drawIconRow(
    ctx,
    anchorX,
    y,
    [
      { icon: drawGlobeIcon, iconSize: 30 * scale, text: CATCHCOUNT_APP_LABEL },
      { icon: drawPhoneIcon, iconSize: 30 * scale, text: CATCHCOUNT_PHONE },
      { icon: drawEnvelopeIcon, iconSize: 30 * scale, text: CATCHCOUNT_EMAIL },
    ],
    { fontSize: 26 * scale, align },
  );
}

function drawSocialRow(ctx, anchorX, y, { scale = 1, align = "center" } = {}) {
  drawIconRow(
    ctx,
    anchorX,
    y,
    [
      { icon: drawInstagramIcon, iconSize: 34 * scale, text: CATCHCOUNT_INSTAGRAM },
      { icon: drawFacebookIcon, iconSize: 34 * scale, text: CATCHCOUNT_FACEBOOK },
    ],
    { fontSize: 26 * scale, align },
  );
}

function drawHorizontalDivider(ctx, centerX, y, width) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, y);
  ctx.lineTo(centerX + width / 2, y);
  ctx.stroke();
  ctx.restore();
}

// The poster's own big, primary QR badge — same white rounded card + fish
// icon styling as the brochure's corner badge (BADGE_*/QR_PAD/ICON_* above),
// scaled up proportionally so the padding/icon ratios look identical, just
// bigger and easier to scan from a few steps back.
// v3.101 — takes an explicit x/y now instead of always centering, so it can
// sit right-aligned next to the new pin tag instead of dead center.
function drawPosterQr(ctx, qrImg, iconImg, x, y) {
  const cx = x + POSTER_QR_SIZE / 2;
  const scale = POSTER_QR_SIZE / BADGE_W;

  ctx.save();
  roundRectPath(ctx, x, y, POSTER_QR_SIZE, POSTER_QR_SIZE, POSTER_QR_R);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.restore();

  const pad = QR_PAD * scale;
  const qrSize = POSTER_QR_SIZE - pad * 2;
  ctx.drawImage(qrImg, x + pad, y + pad, qrSize, qrSize);

  const iconBacking = ICON_BACKING * scale;
  const iconSize = ICON_SIZE * scale;
  const iconR = ICON_BACKING_R * scale;
  const iconCy = y + POSTER_QR_SIZE / 2;
  roundRectPath(ctx, cx - iconBacking / 2, iconCy - iconBacking / 2, iconBacking, iconBacking, iconR);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(iconImg, cx - iconSize / 2, iconCy - iconSize / 2, iconSize, iconSize);
}

// v2.92 — exported: src/lib/standingsImage.js embeds this SAME rendered
// brochure (unchanged) at the bottom of the competition standings image,
// per the organizer's request that the standings download use "the actual
// individual brochure", not an approximation of it.
export async function renderBrochureCanvas({ link, name, contactText, logoUrl, logoBgColor, logoScale }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 700,
    margin: 3,
    // Level H (~30% error correction) — needed both for a slightly
    // off-angle/worn printed flyer AND because the center ~1/4 of the code
    // is covered by the app icon badge below, matching the template.
    errorCorrectionLevel: "H",
    color: { dark: "#0b3554", light: "#ffffff" },
  });

  const [template, qrImg, iconImg, logoImg] = await Promise.all([
    loadImage(TEMPLATE_URL),
    loadImage(qrDataUrl),
    loadImage(APP_ICON_URL),
    loadImageSafe(logoUrl), // v3.84 — best-effort, never rejects
    ensureBrochureFont(),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = PAGE_H; // v3.72 — was TEMPLATE_H; PAGE_H adds the A5 footer banner strip below it
  const ctx = canvas.getContext("2d");

  // 1. The fixed reference graphic, pixel-for-pixel, untouched.
  ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);

  // 1.05. v3.102 — the dashed flow-arrow over the phone cluster.
  drawPhoneFlowArrow(ctx);

  // 1.4. v3.74 — the new A5 footer strip's background: the template's own
  // real bottom-edge color, continued/faded at the template's own observed
  // rate (see drawBannerBackground above), drawn right after the template
  // itself so it reads as one continuous sheet before any text goes on top
  // of either part.
  // v3.105 — full-height fade into the shared blue floor (not the near-
  // black default), matching the poster's fix and keeping all three
  // formats' footers visually consistent (same reasoning as the poster:
  // see BANNER_GRADIENT_FLOOR_BLUE above).
  drawBannerBackground(ctx, BANNER_Y, BANNER_H, { fadePx: BANNER_H, floor: BANNER_GRADIENT_FLOOR_BLUE });

  // 1.41. v3.76 — crossfades the template's own real edge pixels over the
  // seam (see drawSeamFeather above) so no visible line remains between the
  // template and the new strip.
  drawSeamFeather(ctx, template, BANNER_Y);

  // 1.5. v3.107 — restored. v3.106 had removed this (the small venue name
  // directly above the corner QR badge) because the pin-tag redesign below
  // showed the name a second time and that read as a duplicate. The user
  // asked to revert the brochure's footer back to its pre-3.106 shape (see
  // below), so that reasoning no longer applies — this goes back to being
  // the original two-places-show-the-name design every version before
  // 3.106 had ("текста отдолу копира текста, който е над QR кода").
  drawVenueName(ctx, name);

  // 1.6. Optional free-text contact line, below "Сканирай. Регистрирай се.
  // Лови." (v3.21 — see drawContactText above). Independent of the name/QR,
  // so unaffected by the footer rebuild below.
  drawContactText(ctx, contactText);

  // 1.7–1.9. v3.107 — "Брошурата не ми харесва... Възстанови я на версията
  // от 3.100": v3.106's pin-tag/left-to-right redesign (same building blocks
  // as the poster, laid out in one row) is reverted back to the EXACT
  // original shape every version before 3.106 used — a big centered
  // venue-name banner (drawNameBanner) with the logo card on the left, and
  // CatchCount's own motto/contact tucked into the bottom-right corner
  // (drawCatchCountMottoCompact/drawCatchCountFooterCompact — see those two
  // functions above for the three changes made on top of their original
  // shape: bigger motto font, more bottom margin, and the new social row
  // between them).
  const logoDims = getA5LogoDims(logoScale);
  const a5ReservedW = logoImg ? logoDims.w + A5_LOGO_GAP : 0;
  drawNameBanner(ctx, name, {
    centerX: TEMPLATE_W / 2 + a5ReservedW / 2,
    maxWidth: BANNER_MAX_WIDTH - a5ReservedW,
  });

  drawLogoCard(
    ctx, logoImg,
    A5_LOGO_CARD_X + logoDims.w / 2, A5_LOGO_CENTER_Y - logoDims.h / 2,
    logoDims.w, logoDims.h, logoBgColor
  );

  drawCatchCountMottoCompact(ctx);
  drawCatchCountFooterCompact(ctx);

  // 2. Blank out the template's own QR with a fresh white badge in the
  //    exact same spot.
  roundRectPath(ctx, BADGE_X, BADGE_Y, BADGE_W, BADGE_H, BADGE_R);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // 3. This venue's own QR, centered in the badge.
  const qrSize = BADGE_W - QR_PAD * 2;
  const qrX = BADGE_X + (BADGE_W - qrSize) / 2;
  const qrY = BADGE_Y + (BADGE_H - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // 4. The app's fish icon in the center, on its own small white backing —
  //    same look as the template's original badge.
  const cx = BADGE_X + BADGE_W / 2;
  const cy = BADGE_Y + BADGE_H / 2;
  roundRectPath(ctx, cx - ICON_BACKING / 2, cy - ICON_BACKING / 2, ICON_BACKING, ICON_BACKING, ICON_BACKING_R);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(iconImg, cx - ICON_SIZE / 2, cy - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);

  return canvas;
}

// Triggers a browser download of a data: URL without any server round trip
// — same `<a download>` trick used elsewhere in the app for client-side
// exports (e.g. src/lib/dataPortability.js's CSV/ZIP downloads).
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// v3.22 — `format` picks the downloaded file type: "pdf" (default, one-page
// PDF — v3.72: a true A5 landscape sheet, 210×148mm, see PAGE_H/A5_*_MM
// above; was sized to the template's own narrower aspect ratio before
// that), or a direct image download, "png" or "jpg". `filename` is now the
// BASE name with no extension — this function appends the right one for
// `format` (it used to be the full "*.pdf" name; all three callers were
// updated to stop including the extension themselves).
export async function downloadInviteBrochure({ name, link, filename, contactText, logoUrl, logoBgColor, logoScale, format = "pdf" }) {
  const canvas = await renderBrochureCanvas({ link, name, contactText, logoUrl, logoBgColor, logoScale });
  const baseName = filename || "catchcount-broshura";

  if (format === "png") {
    // Lossless — identical fidelity to the PNG embedded in the PDF path
    // below, just saved directly instead of wrapped in a page.
    downloadDataUrl(canvas.toDataURL("image/png"), `${baseName}.png`);
    return;
  }

  if (format === "jpg") {
    // High quality (0.97), not the browser default (~0.92): this frame
    // contains a QR code, and JPEG's block compression can blur module
    // edges enough to fail a scan at lower quality settings — see the PDF
    // path's own comment below for why PNG is used wherever that risk can
    // be avoided entirely instead.
    downloadDataUrl(canvas.toDataURL("image/jpeg", 0.97), `${baseName}.jpg`);
    return;
  }

  // Default: PDF. PNG, not JPEG, for the embedded image — this is a QR
  // code; any lossy compression noise around its modules risks scan
  // failures, which matters far more here than the larger file size (a
  // one-off client-side download, not a network cost).
  const imageDataUrl = canvas.toDataURL("image/png");

  // v3.72 — a true A5 sheet (was pageWidthMm * (TEMPLATE_H/TEMPLATE_W),
  // i.e. the template's own 1.79:1 ratio); the canvas itself is already
  // built at (very nearly, see PAGE_H's rounding) this same ratio, so this
  // page size doesn't stretch or crop it.
  const pageWidthMm = A5_WIDTH_MM;
  const pageHeightMm = A5_HEIGHT_MM;

  const doc = new jsPDF({ unit: "mm", format: [pageWidthMm, pageHeightMm], orientation: "landscape" });
  if (name) doc.setProperties({ title: `CatchCount — ${name}` });
  doc.addImage(imageDataUrl, "PNG", 0, 0, pageWidthMm, pageHeightMm);
  doc.save(`${baseName}.pdf`);
}

// v3.84 — the A4 portrait poster's own canvas builder, mirroring
// renderBrochureCanvas's structure closely (same template, same QR/font
// loading, same "1, 2, 3, 4..." step comments) but built around the much
// taller POSTER_* layout above instead of the short A5 banner.
export async function renderPosterCanvas({ link, name, contactText, logoUrl, logoBgColor, logoScale }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    // Bigger source render than the brochure's own QR (700) — this one is
    // drawn much larger on the page (POSTER_QR_SIZE = 480 vs the brochure
    // badge's 209), so it needs more source resolution to stay crisp.
    width: 900,
    margin: 3,
    errorCorrectionLevel: "H",
    color: { dark: "#0b3554", light: "#ffffff" },
  });

  const [template, qrImg, iconImg, logoImg] = await Promise.all([
    loadImage(POSTER_TEMPLATE_URL),
    loadImage(qrDataUrl),
    loadImage(APP_ICON_URL),
    loadImageSafe(logoUrl),
    ensureBrochureFont(),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = POSTER_PAGE_H;
  const ctx = canvas.getContext("2d");

  // 1. Same reference graphic as the brochure (headline, bullets, phones,
  //    photo — "да наподобява брошурите") — v3.106 loads it from
  //    POSTER_TEMPLATE_URL instead of TEMPLATE_URL, which differs from the
  //    brochure's copy in exactly one spot (see that constant's comment).
  ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);

  // 1.05. v3.102 — the dashed flow-arrow over the phone cluster.
  drawPhoneFlowArrow(ctx);

  // 1.4–1.41. The footer strip's seamless gradient background + crossfaded
  // seam — same treatment as the A5 brochure (drawBannerBackground/
  // drawSeamFeather above), just reaching much further down.
  drawBannerBackground(ctx, POSTER_BANNER_Y, POSTER_BANNER_H, { fadePx: POSTER_BANNER_H, floor: BANNER_GRADIENT_FLOOR_BLUE });
  drawSeamFeather(ctx, template, POSTER_BANNER_Y);

  // 1.5. v3.102 — drawVenueName (the name above the small corner QR badge)
  // used to be drawn here same as the brochure/flyer. On the poster that
  // duplicated both the name and the QR code against the v3.101 pin-tag +
  // big QR footer — the trader pointed this out directly by diffing a
  // render against the reference ("можеш ли да намериш разлика в двете
  // картинки? Защото аз виждам"). Only drawContactText (the free-text line,
  // independent of name/QR) still belongs here — the small corner QR badge
  // itself is gone as of v3.106 (see POSTER_TEMPLATE_URL above), not just
  // covered, so there's nothing left to duplicate.
  // posterContactMaxWidth keeps this clear of the patched-out badge zone
  // (x ≥ ~1040 — see POSTER_TEMPLATE_URL's comment) regardless of the
  // shared CONTACT_MAX_WIDTH (950) used elsewhere.
  const posterContactMaxWidth = 1040 - 20 - CONTACT_X;
  drawContactText(ctx, contactText, posterContactMaxWidth);

  // 1.7. v3.101 — pin-shaped name tag, top-left of the footer strip,
  // replacing the old plain centered drawPosterName.
  const tagBottom = drawVenuePinTag(ctx, POSTER2_PIN_TAG_X, POSTER2_PIN_TAG_TOP, POSTER2_PIN_TAG_MAX_WIDTH, name);

  // 1.8. The venue/water body's own logo, if any — bottom-left now, stacked
  // under the tag (whatever height that ended up being), instead of
  // centered under the old plain name.
  const posterLogoDims = getPosterLogoDims(logoScale);
  const posterLogoY = tagBottom + POSTER2_LOGO_GAP_BELOW_TAG;
  drawLogoCard(ctx, logoImg, POSTER2_LOGO_X + posterLogoDims.w / 2, posterLogoY, posterLogoDims.w, posterLogoDims.h, logoBgColor);
  const leftColBottom = logoImg ? posterLogoY + posterLogoDims.h : tagBottom;

  // 1.75. Decorative dashed connector from the tag to the QR — skipped when
  // there's no tag drawn (empty name: tagBottom === POSTER2_PIN_TAG_TOP).
  // v3.106 — the tag and QR now sit side by side at roughly the same height
  // (see POSTER2_QR_Y's comment above), so the connector is a short
  // diagonal from the tag's right edge to the QR's own left edge, instead
  // of the old near-vertical reach up into the photo.
  if (tagBottom > POSTER2_PIN_TAG_TOP) {
    drawDashedConnector(
      ctx,
      POSTER2_PIN_TAG_X + POSTER2_PIN_TAG_MAX_WIDTH,
      POSTER2_PIN_TAG_TOP + (tagBottom - POSTER2_PIN_TAG_TOP) / 2,
      POSTER2_QR_X,
      POSTER2_QR_Y + POSTER_QR_SIZE * 0.3,
    );
  }

  // 1.9. The poster's own big, primary QR — right-aligned, with its own
  // label pill below it (mirrors the reference layout's own QR + label).
  drawPosterQr(ctx, qrImg, iconImg, POSTER2_QR_X, POSTER2_QR_Y);
  drawQrLabelPill(ctx, POSTER2_QR_X + POSTER_QR_SIZE / 2, POSTER2_QR_Y + POSTER_QR_SIZE + POSTER2_QR_LABEL_GAP, POSTER_QR_SIZE);
  const qrColBottom = POSTER2_QR_Y + POSTER_QR_SIZE + POSTER2_QR_LABEL_GAP + POSTER2_QR_LABEL_H;

  // v3.106 — "Опитай се да копираш новия постер, който ти изпратих":
  // rewritten to read left-to-right from POSTER2_BOTTOM_BLOCK_X (same left
  // margin as the pin tag/logo above), matching the reference image, where
  // none of logo/motto/contact/social sit centered on the page. Starts a
  // fixed gap below whichever of the two columns above (name+logo on the
  // left, QR+label on the right) ends up taller, so it never overlaps
  // either one regardless of name length / logo presence.
  const clusterBottom = Math.max(leftColBottom, qrColBottom);
  const BOTTOM_BLOCK_GAP = 90;

  // 1.10. The brand motto — 46px, left-aligned under the cluster.
  const mottoFont = 46;
  const mottoY = clusterBottom + BOTTOM_BLOCK_GAP + mottoFont * 0.8;
  drawCatchCountMotto(ctx, POSTER2_BOTTOM_BLOCK_X, mottoY, { font: mottoFont, align: "left" });

  // 1.11. v3.101 — CatchCount's own contact line, a row with icons
  // (website/phone/email), now left-aligned under the motto.
  const contactY = mottoY + 60;
  drawIconContactRow(ctx, POSTER2_BOTTOM_BLOCK_X, contactY, { align: "left" });

  // 1.12. v3.101 — a thin divider and a social-media row (Instagram/
  // Facebook), same fixed app-wide handles for every poster — see
  // CATCHCOUNT_INSTAGRAM/CATCHCOUNT_FACEBOOK above. Divider now spans from
  // the same left margin instead of being centered.
  const dividerY = contactY + 45;
  const socialY = dividerY + 55;
  drawHorizontalDivider(ctx, POSTER2_BOTTOM_BLOCK_X + POSTER2_DIVIDER_WIDTH / 2, dividerY, POSTER2_DIVIDER_WIDTH);
  drawSocialRow(ctx, POSTER2_BOTTOM_BLOCK_X, socialY, { align: "left" });

  return canvas;
}

// ─── A6 flyer, for the GENERIC (no-merchant) brochure only (v3.87) ────────
// "На празната рекламна брошура, която не е обвързана с търговец добави
// формат А6, в който да липсва празната част отдолу" — the generic flyer
// (AdminSetup.jsx's "Обща брошура", no venue name and no logo) draws
// drawNameBanner with an empty `name`, which — per that function's own
// early return — leaves the whole A5 footer banner (BANNER_H≈202px) as a
// plain navy strip with nothing in it but the small corner contact line:
// exactly the wasted "empty part at the bottom" being described.
//
// True ISO A6 landscape (148×105mm) is, by construction, almost the exact
// same aspect ratio as A5 landscape (both are the same ISO 216 shape, just
// different sizes — A6 is literally an A5 sheet folded in half) — so
// hitting it to the millimeter from this same wide template would need
// essentially the SAME added height as the A5 banner already uses, not
// less, and narrowing the template itself to fit A6's ratio instead would
// crop into the QR badge sitting near the right edge (BADGE_X=1096, only
// ~280px from the template's own right edge at 1376) — unacceptable, since
// the QR is the one thing a flyer can't do without. So this deliberately
// keeps the FULL, uncropped template (nothing trimmed, QR badge untouched)
// and adds only a compact strip — just tall enough for CatchCount's own
// contact line — instead of the full A5 banner height. The resulting PDF
// page keeps A6's own 148mm width but comes out shorter than 105mm as a
// result (see A6_HEIGHT_MM below) — a deliberate trade favoring "no wasted
// blank space and nothing cropped" over exact ISO conformance.
//
// v3.87 — "Свий флаера още по вертикала... отдолу постави контактите":
// shrunk further still. FLYER_BANNER_Y (where the added strip's own
// seamless gradient background starts, see drawBannerBackground/
// drawSeamFeather below) now starts a bit BEFORE the template's real
// bottom edge (TEMPLATE_H) instead of exactly at it — safe to do because
// that last stretch of the template's own artwork is itself just plain,
// empty background with nothing drawn on it, so starting the strip's fill
// a little early simply reclaims that unused margin instead of drawing it
// twice.
//
// v3.90 — pushed a good deal further still ("Вдигни и контактите още
// нагоре, за да се свие още флаера по вертикала"). Safe to do more
// aggressively than the v3.87 pass allowed, because v3.89 hid the
// free-text "own contact" field (BrochureContactDialog's showContactText)
// for this exact download — the generic, venue-less flyer never has
// anything drawn at CONTACT_BASELINE_Y=728 any more (see drawContactText
// below), so there's no longer any admin-typed text to protect clearance
// for. The REAL floor turned out not to be the left-side caption (its own
// row ends around y≈700) but the "СКАНИРАЙ И ..." label under the QR
// badge on the right — baked into the template at y≈701-719, further
// down than the caption. A first pass here only checked the caption and
// clipped that label under the new strip's own fill; FLYER_BANNER_Y=730
// clears the label's real bottom edge (plus its soft shadow) with a small
// safety margin instead.
// v3.98 — grown from 76 to 104px to fit the brand motto as its own, fully
// legible line (not a squeeze into the existing two lines): "добави към
// флаера мотото на CatchCount, така че да е забележимо" (add the motto to
// the flyer, so it's noticeable) — the user's own explicit call, same
// trade-off already accepted for this format (A6_HEIGHT_MM below has never
// been exact ISO 105mm — see the comment above this block for why). The
// generic flyer has no venue name and no logo, so unlike the A5 brochure
// there's nothing for a centered, full-width line to ever collide with.
//
// v3.99 — "намали пак размера на долната лента и увеличи малко текста на
// мотото": strip shrunk again (104 -> 84) while the motto's own font grew
// (20 -> 23px, see FLYER_MOTTO_Y below) — the three line gaps and the
// trim-safety margin were each tightened a few px to absorb that, rather
// than reverting toward the pre-motto 76px (which no longer has room for
// the motto as its own line at all).
const FLYER_STRIP_H = 84;
const FLYER_BANNER_Y = 730;
const FLYER_PAGE_H = FLYER_BANNER_Y + FLYER_STRIP_H;
const A6_WIDTH_MM = 148;
// Derived from the actual pixel ratio (not a fixed 105) so the PDF page
// never stretches the canvas — see the comment above for why it isn't
// literally 105.
const A6_HEIGHT_MM = Math.round((A6_WIDTH_MM * FLYER_PAGE_H / TEMPLATE_W) * 10) / 10;

// v3.98 — the motto sits first, right under the seam, sized between the
// app label (24px) and the detail line (16px) so it reads as the strip's
// headline rather than competing with "catchcount.app" for attention.
// v3.99 — font raised 20 -> 23px ("увеличи малко текста на мотото"); the
// seam gap tightened 24 -> 22px to help offset the strip's own shrink.
const FLYER_MOTTO_Y = FLYER_BANNER_Y + 22;

// v3.87 — "остави информацията за връзка с catchcount.app, но я повдигнеш
// малко по-нагоре, да не е съвсем в долната част да не е проблем при
// отрязването на брошурите": the detail line's baseline sits well clear of
// the strip's own bottom edge (FLYER_PAGE_H), not hugging it, so a
// slightly-off physical trim cut on a printed sheet of these flyers won't
// clip it. v3.90 — padding trimmed slightly to match the shorter strip;
// the bottom margin below the detail line stays ~26px, the same
// trim-safety cushion as before. v3.98 — app/detail both shifted down to
// make room for FLYER_MOTTO_Y above them; the ~26px trim-safety cushion
// below the detail line is preserved unchanged (FLYER_STRIP_H grew by
// exactly the same amount these two shifted by). v3.99 — both gaps
// tightened (30 -> 25, 24 -> 19) and the trim-safety cushion below the
// detail line trimmed 26 -> 18px (still a real cushion, just a smaller
// one) so the strip could shrink again while the motto's own font grew.
const FLYER_FOOTER_APP_Y = FLYER_MOTTO_Y + 25;
const FLYER_FOOTER_DETAIL_Y = FLYER_FOOTER_APP_Y + 19;

// Same structure as renderBrochureCanvas/renderPosterCanvas above, minus
// everything that only makes sense for a specific venue: no name (there is
// none), no logo (no venue to own one). Still takes `contactText` — the
// admin's own optional free-text line (see drawContactText) works exactly
// the same way here as on the other two.
export async function renderFlyerA6Canvas({ link, contactText }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 700,
    margin: 3,
    errorCorrectionLevel: "H",
    color: { dark: "#0b3554", light: "#ffffff" },
  });

  const [template, qrImg, iconImg] = await Promise.all([
    loadImage(TEMPLATE_URL),
    loadImage(qrDataUrl),
    loadImage(APP_ICON_URL),
    ensureBrochureFont(),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = TEMPLATE_W;
  canvas.height = FLYER_PAGE_H;
  const ctx = canvas.getContext("2d");

  // 1. The exact same fixed reference graphic, fully untouched — nothing
  //    cropped, so the QR badge and every other pixel stay intact.
  ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);

  // 1.05. v3.102 — the dashed flow-arrow over the phone cluster.
  drawPhoneFlowArrow(ctx);

  // 1.4–1.41. The compact strip's own seamless gradient background +
  // crossfaded seam — same treatment as the A5 brochure/A4 poster, just a
  // much shorter strip. Starts at FLYER_BANNER_Y (a little before the
  // template's own real bottom edge) — see that constant's comment above
  // for why that's safe.
  // v3.105 — full-height fade into the shared blue floor, matching the
  // other two formats (see BANNER_GRADIENT_FLOOR_BLUE above).
  drawBannerBackground(ctx, FLYER_BANNER_Y, FLYER_STRIP_H, { fadePx: FLYER_STRIP_H, floor: BANNER_GRADIENT_FLOOR_BLUE });
  drawSeamFeather(ctx, template, FLYER_BANNER_Y);

  // 1.6. The admin's own optional free-text contact line, same spot as on
  // the other two formats (lives inside the untouched top artwork).
  drawContactText(ctx, contactText);

  // 1.65. v3.98 — the brand motto, first line of the strip (see
  // FLYER_MOTTO_Y's own comment for why this format can take it as a
  // plain centered line, unlike the A5 brochure).
  drawCatchCountMotto(ctx, TEMPLATE_W / 2, FLYER_MOTTO_Y, { font: 23 });

  // 1.7. CatchCount's own fixed contact line — deliberately smaller than
  // the poster's own two-line footer (POSTER_FOOTER_*) to match this much
  // shorter strip.
  drawCatchCountFooter(ctx, TEMPLATE_W / 2, FLYER_FOOTER_APP_Y, FLYER_FOOTER_DETAIL_Y, { appFont: 24, detailFont: 16 });

  // 2–4. The small corner QR badge, exactly like the brochure/poster.
  roundRectPath(ctx, BADGE_X, BADGE_Y, BADGE_W, BADGE_H, BADGE_R);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const qrSize = BADGE_W - QR_PAD * 2;
  const qrX = BADGE_X + (BADGE_W - qrSize) / 2;
  const qrY = BADGE_Y + (BADGE_H - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const cx = BADGE_X + BADGE_W / 2;
  const cy = BADGE_Y + BADGE_H / 2;
  roundRectPath(ctx, cx - ICON_BACKING / 2, cy - ICON_BACKING / 2, ICON_BACKING, ICON_BACKING, ICON_BACKING_R);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(iconImg, cx - ICON_SIZE / 2, cy - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);

  return canvas;
}

// v3.87 — same format/download mechanics as downloadInviteBrochure above,
// built around the compact A6 flyer instead of the A5/A4 layouts. No
// `name`/`logoUrl` params — see renderFlyerA6Canvas above for why.
export async function downloadFlyerA6({ link, filename, contactText, format = "pdf" }) {
  const canvas = await renderFlyerA6Canvas({ link, contactText });
  const baseName = filename || "catchcount-flaer-a6";

  if (format === "png") {
    downloadDataUrl(canvas.toDataURL("image/png"), `${baseName}.png`);
    return;
  }

  if (format === "jpg") {
    downloadDataUrl(canvas.toDataURL("image/jpeg", 0.97), `${baseName}.jpg`);
    return;
  }

  const imageDataUrl = canvas.toDataURL("image/png");
  const doc = new jsPDF({ unit: "mm", format: [A6_WIDTH_MM, A6_HEIGHT_MM], orientation: "landscape" });
  doc.setProperties({ title: "CatchCount — Флаер А6" });
  doc.addImage(imageDataUrl, "PNG", 0, 0, A6_WIDTH_MM, A6_HEIGHT_MM);
  doc.save(`${baseName}.pdf`);
}

// v3.84 — same format/download mechanics as downloadInviteBrochure above,
// built around the A4 portrait poster instead of the A5 landscape brochure.
export async function downloadInvitePoster({ name, link, filename, contactText, logoUrl, logoBgColor, logoScale, format = "pdf" }) {
  const canvas = await renderPosterCanvas({ link, name, contactText, logoUrl, logoBgColor, logoScale });
  const baseName = filename || "catchcount-poster";

  if (format === "png") {
    downloadDataUrl(canvas.toDataURL("image/png"), `${baseName}.png`);
    return;
  }

  if (format === "jpg") {
    downloadDataUrl(canvas.toDataURL("image/jpeg", 0.97), `${baseName}.jpg`);
    return;
  }

  const imageDataUrl = canvas.toDataURL("image/png");
  const doc = new jsPDF({ unit: "mm", format: [A4_WIDTH_MM, A4_HEIGHT_MM], orientation: "portrait" });
  if (name) doc.setProperties({ title: `CatchCount — ${name} — Постер` });
  doc.addImage(imageDataUrl, "PNG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
  doc.save(`${baseName}.pdf`);
}
