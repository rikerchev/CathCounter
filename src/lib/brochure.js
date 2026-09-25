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
 */

const TEMPLATE_URL = "/brochure-template.jpg";
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
const BANNER_MAX_FONT = 96;
const BANNER_ONE_LINE_MIN_FONT = 56;
const BANNER_TWO_LINE_MAX_FONT = 56;
const BANNER_TWO_LINE_MIN_FONT = 26;
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

// Must run AFTER the template has been drawn onto `ctx` and BEFORE any text
// is drawn into the strip.
function drawBannerBackground(ctx) {
  const edgeRgb = sampleTemplateEdgeColor(ctx);
  const fadeStop = Math.min(1, BANNER_FADE_PX / BANNER_H);

  const gradient = ctx.createLinearGradient(0, BANNER_Y, 0, PAGE_H);
  gradient.addColorStop(0, `rgb(${edgeRgb.join(", ")})`);
  gradient.addColorStop(fadeStop, BANNER_FLOOR);
  if (fadeStop < 1) gradient.addColorStop(1, BANNER_FLOOR);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, BANNER_Y, TEMPLATE_W, BANNER_H);
  ctx.restore();
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
function drawNameBanner(ctx, name) {
  const label = (name || "").trim().toUpperCase();
  if (!label) return;

  const centerX = TEMPLATE_W / 2;
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
  while (fontSize > BANNER_ONE_LINE_MIN_FONT && ctx.measureText(label).width > BANNER_MAX_WIDTH) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  if (ctx.measureText(label).width <= BANNER_MAX_WIDTH) {
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
    (ctx.measureText(lines[0]).width > BANNER_MAX_WIDTH || ctx.measureText(lines[1]).width > BANNER_MAX_WIDTH)
  ) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    lines = bestTwoLineSplit(ctx, words);
  }

  // Still too wide at the floor size (a pathological single long word) —
  // ellipsize whichever line overflows, same safety net used elsewhere in
  // this file.
  lines = lines.map((line) =>
    ctx.measureText(line).width > BANNER_MAX_WIDTH ? ellipsize(ctx, line, BANNER_MAX_WIDTH) : line
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

function drawContactText(ctx, contactText) {
  // Free text, as typed — no trim-to-empty-only-check beyond whitespace, no
  // uppercasing (unlike drawVenueName): this may be a URL or a Facebook
  // handle, both case-sensitive, not just a name.
  const text = (contactText || "").trim();
  if (!text) return;

  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  let fontSize = CONTACT_MAX_FONT;
  ctx.font = `700 ${fontSize}px ${fontStack}`;
  while (fontSize > CONTACT_MIN_FONT && ctx.measureText(text).width > CONTACT_MAX_WIDTH) {
    fontSize -= 1;
    ctx.font = `700 ${fontSize}px ${fontStack}`;
  }

  let out = text;
  if (ctx.measureText(out).width > CONTACT_MAX_WIDTH) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > CONTACT_MAX_WIDTH) {
      out = out.slice(0, -1);
    }
    out = `${out}…`;
  }

  // Same soft shadow treatment as drawVenueName, for the same reason —
  // legibility over the template's variable particle/line background.
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(out, CONTACT_X, CONTACT_BASELINE_Y);
  ctx.restore();
}

// v2.92 — exported: src/lib/standingsImage.js embeds this SAME rendered
// brochure (unchanged) at the bottom of the competition standings image,
// per the organizer's request that the standings download use "the actual
// individual brochure", not an approximation of it.
export async function renderBrochureCanvas({ link, name, contactText }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 700,
    margin: 3,
    // Level H (~30% error correction) — needed both for a slightly
    // off-angle/worn printed flyer AND because the center ~1/4 of the code
    // is covered by the app icon badge below, matching the template.
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
  canvas.height = PAGE_H; // v3.72 — was TEMPLATE_H; PAGE_H adds the A5 footer banner strip below it
  const ctx = canvas.getContext("2d");

  // 1. The fixed reference graphic, pixel-for-pixel, untouched.
  ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);

  // 1.4. v3.74 — the new A5 footer strip's background: the template's own
  // real bottom-edge color, continued/faded at the template's own observed
  // rate (see drawBannerBackground above), drawn right after the template
  // itself so it reads as one continuous sheet before any text goes on top
  // of either part.
  drawBannerBackground(ctx);

  // 1.5. This venue/water body's name, above the QR badge (v2.80).
  drawVenueName(ctx, name);

  // 1.6. Optional free-text contact line, below "Сканирай. Изтегли. Лови."
  // (v3.21 — see drawContactText above).
  drawContactText(ctx, contactText);

  // 1.7. v3.72 — the venue/water body's name again, large, over the footer
  // strip's background (see drawNameBanner above). Drawn last of the three
  // text passes so it's independent of the other two, but before the QR
  // badge below since it never overlaps that area anyway.
  drawNameBanner(ctx, name);

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
export async function downloadInviteBrochure({ name, link, filename, contactText, format = "pdf" }) {
  const canvas = await renderBrochureCanvas({ link, name, contactText });
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
