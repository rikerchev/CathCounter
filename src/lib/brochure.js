import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * downloadInviteBrochure — v2.72. A printable A5 marketing flyer for a water
 * body or commercial venue: its name + a QR code that encodes it directly
 * (server/routes/merchantReferrals.ts — no GPS/location guessing, the id is
 * baked into the link itself). Every venue/water body gets its OWN flyer
 * with its OWN unique QR — this function is called once per entity with
 * that entity's `link` (see TraderVenues.jsx / WaterBodyManagement.jsx), so
 * two different traders never share a QR and every scan is attributable.
 * Pin it up or hand it out; every new account that registers through it can
 * earn that merchant free banner-advertising time, if the owner/admin has
 * configured a bonus (0 days / no banner by default — MerchantBonusEditor).
 *
 * v2.72 — full visual redesign to match the reference marketing graphic the
 * trader asked to mirror (dark-blue gradient hero, bold two-line headline,
 * checkmarked feature list, a simplified "app" card + GPS badge, and a
 * rounded QR badge with a short scan/download tagline). jsPDF's own drawing
 * primitives (rects + built-in fonts) can't reproduce that look — no
 * gradients, no shadows, no glow, and (see the v2.70 fix this replaces)
 * jsPDF's built-in fonts don't even render Cyrillic. So instead of drawing
 * directly on the PDF, we paint the whole flyer on an offscreen <canvas> at
 * print resolution (the browser's own 2D renderer: real gradients, blur,
 * anti-aliased rounded rects, and — since text is drawn by the browser's
 * normal font engine, not embedded in the PDF — Cyrillic just works, no
 * font file to fetch or subset), then drop that single flattened image into
 * a one-page A5 PDF. Still fully client-side — no server round trip beyond
 * the id already encoded in `link`.
 */

const PAGE_W_MM = 148; // A5 portrait
const PAGE_H_MM = 210;

// Print-resolution canvas, ~180dpi at A5 (aspect ratio matches PAGE_W/H_MM
// to ~0.1%, so it maps onto the PDF page with no letterboxing or stretch).
const CW = 1050;
const CH = 1488;

const COLOR = {
  gradTop: "#0a2540",
  gradMid: "#0e5a78",
  gradBottom: "#0891b2", // cyan-600 — matches the app's own brand accent
  ink: "#0b3554", // dark navy text on light surfaces
  white: "#ffffff",
};

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}…`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

function drawCheckBullet(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.12, cy + r * 0.38);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.32);
  ctx.lineWidth = r * 0.26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = COLOR.white;
  ctx.stroke();
  ctx.restore();
}

function drawPinIcon(ctx, cx, cy, s) {
  // Small map-pin glyph for the "GPS" badge — a circle on a teardrop, drawn
  // with primitives rather than an icon font so it needs no extra asset.
  ctx.save();
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.42, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(cx, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.gradBottom;
  ctx.fill();
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

async function renderBrochureCanvas({ name, qrDataUrl }) {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const M = 70; // side margin
  const contentW = CW - M * 2;

  // ---- Background: dark-blue-to-cyan gradient + soft glow accents ----
  const grad = ctx.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0, COLOR.gradTop);
  grad.addColorStop(0.55, COLOR.gradMid);
  grad.addColorStop(1, COLOR.gradBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  try {
    ctx.save();
    ctx.filter = "blur(90px)";
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = COLOR.white;
    ctx.beginPath();
    ctx.arc(CW - 120, 260, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(60, CH - 260, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } catch {
    // ctx.filter isn't supported in a handful of older WebViews — the glow
    // is purely decorative, so just skip it rather than draw a hard-edged
    // circle that would look worse than no circle at all.
  }

  // ---- Brand bar ----
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.white;
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText("CatchCount", CW / 2, 95);
  ctx.font = `400 22px ${FONT}`;
  ctx.globalAlpha = 0.82;
  ctx.fillText("Риболовен дневник за телефона", CW / 2, 132);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, 168);
  ctx.lineTo(CW - M, 168);
  ctx.stroke();

  // ---- Headline ----
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.white;
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText("Хвани момента.", M, 300);
  ctx.fillText("Запази улова.", M, 390);

  // ---- Venue name pill ----
  const pillY = 440;
  const pillH = 88;
  roundRectPath(ctx, M, pillY, contentW, pillH, 24);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = COLOR.ink;
  ctx.textAlign = "left";
  const venueLabel = `Обект: ${name || ""}`;
  ctx.fillText(truncateToWidth(ctx, venueLabel, contentW - 64), M + 32, pillY + pillH / 2 + 12);

  // ---- Feature list ----
  const features = [
    "Записвай улова си",
    "Откривай водоеми",
    "Следи риболовните си приключения",
    "Намери всичко необходимо за следващия излет",
  ];
  const featStartY = 570;
  const rowH = 105;
  ctx.font = `500 32px ${FONT}`;
  features.forEach((line, i) => {
    const rowCenterY = featStartY + i * rowH + rowH / 2;
    drawCheckBullet(ctx, M + 28, rowCenterY, 26);
    ctx.fillStyle = COLOR.white;
    ctx.textAlign = "left";
    ctx.fillText(line, M + 80, rowCenterY + 11);
  });

  // ---- App card (left) + QR badge (right) ----
  const rowY = 1030;
  const rowH2 = 340;

  // App card
  const cardW = 430;
  roundRectPath(ctx, M, rowY, cardW, rowH2, 28);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  const screenPad = 40;
  const screenX = M + screenPad;
  const screenY = rowY + 34;
  const screenW = cardW - screenPad * 2;
  const screenH = rowH2 - 100;
  roundRectPath(ctx, screenX, screenY, screenW, screenH, 16);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();

  // Simplified "catch log" rows inside the screen — evokes the app's own
  // list UI without needing an actual screenshot asset.
  const entryRows = 3;
  const entryH = screenH / (entryRows + 0.6);
  for (let i = 0; i < entryRows; i++) {
    const ey = screenY + 24 + i * entryH;
    ctx.beginPath();
    ctx.arc(screenX + 26, ey + entryH / 2 - 14, 14, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.gradBottom;
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    roundRectPath(ctx, screenX + 54, ey + entryH / 2 - 24, screenW - 80, 12, 6);
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    roundRectPath(ctx, screenX + 54, ey + entryH / 2 - 4, (screenW - 80) * 0.55, 10, 5);
    ctx.fill();
  }

  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("Твоят риболовен дневник", M + cardW / 2, rowY + rowH2 - 26);

  // GPS badge, overlapping the card's top-right corner
  const badgeW = 140;
  const badgeH = 50;
  const badgeX = M + cardW - badgeW - 18;
  const badgeY = rowY - badgeH / 2;
  roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = COLOR.gradBottom;
  ctx.fill();
  drawPinIcon(ctx, badgeX + 34, badgeY + badgeH / 2, 30);
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = COLOR.white;
  ctx.textAlign = "left";
  ctx.fillText("GPS", badgeX + 56, badgeY + badgeH / 2 + 9);

  // QR badge
  const qrBadgeW = CW - M - (M + cardW + 30);
  const qrBadgeX = M + cardW + 30;
  roundRectPath(ctx, qrBadgeX, rowY, qrBadgeW, rowH2, 28);
  ctx.fillStyle = COLOR.white;
  ctx.fill();

  ctx.textAlign = "center";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = COLOR.ink;
  ctx.fillText("СКАНИРАЙ", qrBadgeX + qrBadgeW / 2, rowY + 48);

  const qrImg = await loadImage(qrDataUrl);
  const qrSize = Math.min(qrBadgeW, rowH2) - 130;
  const qrX = qrBadgeX + (qrBadgeW - qrSize) / 2;
  const qrY = rowY + 66;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = COLOR.ink;
  ctx.fillText("Изтегли. Лови.", qrBadgeX + qrBadgeW / 2, rowY + rowH2 - 28);

  // ---- Footer ----
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, 1420);
  ctx.lineTo(CW - M, 1420);
  ctx.stroke();

  ctx.font = `400 24px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "center";
  ctx.fillText("catchcount.app4.you", CW / 2, 1460);

  return canvas;
}

export async function downloadInviteBrochure({ name, link, filename }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 600,
    // ~4-module quiet zone — under that, most phone cameras won't even
    // detect the code, let alone decode it (matches ReferralCard.jsx).
    margin: 4,
    // Level H (~30% error correction) — tolerant of a slightly off-angle
    // phone, print/ink imperfections, or a worn/creased flyer.
    errorCorrectionLevel: "H",
    // True black/white reads as higher-contrast to a phone camera's QR
    // detector than a colored tone — matters more on paper than brand color.
    color: { dark: "#000000", light: "#ffffff" },
  });

  const canvas = await renderBrochureCanvas({ name, qrDataUrl });
  // JPEG, not PNG — the whole canvas is opaque (no transparency to lose)
  // and this keeps the PDF file small even at print resolution.
  const imageDataUrl = canvas.toDataURL("image/jpeg", 0.93);

  const doc = new jsPDF({ unit: "mm", format: "a5" });
  doc.addImage(imageDataUrl, "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
  doc.save(filename || "catchcount-broshura.pdf");
}
