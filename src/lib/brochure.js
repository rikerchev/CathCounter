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
 * own "СКАНИРАЙ И ИЗТЕГЛИ" label style instead of a generic system font.
 *
 * v3.21 — an optional second line of free text (see drawContactText below),
 * drawn in the template's other empty strip — directly under the existing
 * "Сканирай. Изтегли. Лови." caption, bottom-left — for the owner/admin/
 * merchant to add their own contact info before downloading (prompted by
 * src/components/BrochureContactDialog.jsx on all three download screens).
 * Deliberately free text with NO icon drawn next to it and NO forced
 * uppercase/format: the box is offered as "add a phone number" but the
 * trader may just as well want a website, a Facebook page, or a custom
 * label like "За резервация тел.: ...", so the app must not assume it's a
 * phone number and slap a phone glyph in front of whatever they typed.
 */

const TEMPLATE_URL = "/brochure-template.jpg";
// v2.91 — exported: reused by src/lib/standingsImage.js so the competition
// standings download shares this same app icon and house font instead of
// loading/registering its own copies.
export const APP_ICON_URL = "/icon-512.png";
const FONT_BOLD_URL = "/fonts/CatchCountBrochure-Bold.ttf";
const TEMPLATE_W = 1376;
const TEMPLATE_H = 768;

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

// Draws the optional free-text contact line, left-aligned, in the empty
// dark strip below the template's own "Сканирай. Изтегли. Лови." caption
// (that caption's icon sits at x=73, y≈690-725; the strip below it, y≈724-
// 768, is empty background across the full width of the template — measured
// directly on the source image the same way BADGE_*/NAME_* above were).
// Left-aligned (not centered like the venue name) so it reads as a
// continuation of the caption line above it, and capped well short of the
// QR badge (BADGE_X = 1096) so a long line never runs into it.
const CONTACT_X = 73;
const CONTACT_BASELINE_Y = 752;
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
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext("2d");

  // 1. The fixed reference graphic, pixel-for-pixel, untouched.
  ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);

  // 1.5. This venue/water body's name, above the QR badge (v2.80).
  drawVenueName(ctx, name);

  // 1.6. Optional free-text contact line, below "Сканирай. Изтегли. Лови."
  // (v3.21 — see drawContactText above).
  drawContactText(ctx, contactText);

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
// PDF sized to the template's own aspect ratio — unchanged from v2.69), or
// a direct image download, "png" or "jpg". `filename` is now the BASE name
// with no extension — this function appends the right one for `format` (it
// used to be the full "*.pdf" name; all three callers were updated to stop
// including the extension themselves).
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

  const pageWidthMm = 210;
  const pageHeightMm = pageWidthMm * (TEMPLATE_H / TEMPLATE_W);

  const doc = new jsPDF({ unit: "mm", format: [pageWidthMm, pageHeightMm], orientation: "landscape" });
  if (name) doc.setProperties({ title: `CatchCount — ${name}` });
  doc.addImage(imageDataUrl, "PNG", 0, 0, pageWidthMm, pageHeightMm);
  doc.save(`${baseName}.pdf`);
}
