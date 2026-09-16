import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { roundRectPath, loadImage, ensureBrochureFont, APP_ICON_URL } from "./brochure";
import { getMerchantBrochureLink } from "./referral";

/**
 * downloadStandingsImage — v2.91. The competition standings PNG (the
 * "Изтегли като снимка" button in both WaterBodyManagement.jsx and
 * Competitions.jsx's standings dialogs) used to be a plain html2canvas
 * screenshot of the ranked list and nothing else. The organizer asked for
 * it to double as a small piece of marketing, styled like the existing
 * printed brochure (src/lib/brochure.js — same dark background, house
 * font, and QR-in-a-white-badge treatment): the ranked list on top, and a
 * banner strip glued to the bottom with the water body's own QR code (so
 * anyone who receives/sees this image can scan straight into the app,
 * already attributed to that water body — reuses the same
 * getMerchantBrochureLink() link as the brochure) plus a handful of its
 * public attributes (location, species, fee, phone).
 *
 * Page shape: fixed A4 width, "top half / bottom half" ONLY as a target for
 * a typical-sized standings list — BANNER_H is fixed, but the table section
 * above it is never shrunk below legibility to force an exact half: a short
 * list gets padded to fill the top half (so the overall image really does
 * look like a clean A4 half/half split), while a long participant list is
 * simply allowed to make the whole image taller instead of squeezing text.
 *
 * Deliberately does NOT attempt to draw the water body's own logo_url onto
 * the canvas: unlike the brochure's own same-origin assets (app icon,
 * template), logo_url is an arbitrary externally-hosted URL with no
 * guaranteed CORS headers — drawing a non-CORS image onto a canvas taints
 * it and makes canvas.toDataURL() throw, which would break the ENTIRE
 * download rather than just omit one logo. Not worth that risk for a
 * decorative image.
 */

const PAGE_W = 1240; // A4 width @ ~150dpi
const PAGE_H = 1754; // A4 height @ ~150dpi — PAGE_H/2 is the banner's fixed height
const BANNER_H = Math.round(PAGE_H / 2);
const PAD = 56;

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth || !current) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsize the last kept line if there's leftover text that didn't fit.
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

async function drawBanner(ctx, bannerY, { competition, waterBody }, t) {
  const x = 0;
  const y = bannerY;
  const w = PAGE_W;
  const h = BANNER_H;

  // 1. Dark brand-colored background, same visual language as the printed
  // brochure (dark navy, white/cyan text, white QR badge).
  const gradient = ctx.createLinearGradient(0, y, w, y + h);
  gradient.addColorStop(0, "#0b1f33");
  gradient.addColorStop(1, "#0e3a52");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  const [appIcon, qrDataUrl] = await Promise.all([
    loadImage(APP_ICON_URL),
    competition?.water_body_id
      ? QRCode.toDataURL(getMerchantBrochureLink("water_body", competition.water_body_id), {
          width: 500,
          margin: 2,
          errorCorrectionLevel: "H",
          color: { dark: "#0b3554", light: "#ffffff" },
        })
      : Promise.resolve(null),
    ensureBrochureFont(),
  ]);

  const fontStack = `"CatchCountBrochure", Arial, sans-serif`;
  const badgeSize = Math.round(h * 0.42);
  const badgeX = x + w - PAD - badgeSize;
  const badgeY = y + Math.round((h - badgeSize) / 2) - 10;

  // 2. QR badge, right side — same white-rounded-badge + centered app-icon
  // treatment as the brochure, just smaller.
  if (qrDataUrl) {
    const qrImg = await loadImage(qrDataUrl);
    roundRectPath(ctx, badgeX, badgeY, badgeSize, badgeSize, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    const qrPad = Math.round(badgeSize * 0.08);
    const qrSize = badgeSize - qrPad * 2;
    ctx.drawImage(qrImg, badgeX + qrPad, badgeY + qrPad, qrSize, qrSize);
    const iconBacking = Math.round(badgeSize * 0.22);
    const cx = badgeX + badgeSize / 2;
    const cy = badgeY + badgeSize / 2;
    roundRectPath(ctx, cx - iconBacking / 2, cy - iconBacking / 2, iconBacking, iconBacking, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    const iconSize = Math.round(iconBacking * 0.8);
    ctx.drawImage(appIcon, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 20px ${fontStack}`;
    ctx.fillText(t("standingsImg.scanToDownload"), badgeX + badgeSize / 2, badgeY + badgeSize + 30);
  }

  // 3. App wordmark, top-left of the banner.
  const contentX = x + PAD;
  const contentW = badgeX - PAD - contentX;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px ${fontStack}`;
  ctx.fillText("CatchCount", contentX, y + PAD + 20);
  ctx.fillStyle = "#67e8f9";
  ctx.font = `400 18px Arial, sans-serif`;
  ctx.fillText(t("standingsImg.tagline"), contentX, y + PAD + 46);

  // 4. Water body name + a handful of its public attributes.
  let cursorY = y + PAD + 100;
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 34px ${fontStack}`;
  const nameLines = wrapLines(ctx, (competition?.water_body_name || "").toUpperCase(), contentW, 2);
  for (const line of nameLines) {
    ctx.fillText(line, contentX, cursorY);
    cursorY += 38;
  }
  cursorY += 12;

  ctx.font = `400 22px Arial, sans-serif`;
  ctx.fillStyle = "#e2f4f9";
  const attrLines = [];
  if (waterBody?.location) attrLines.push(`${t("standingsImg.location")}: ${waterBody.location}`);
  if (waterBody?.fish_population) attrLines.push(`${t("standingsImg.fish")}: ${waterBody.fish_population}`);
  if (waterBody?.fee_per_person != null && waterBody.fee_per_person > 0) {
    attrLines.push(`${t("standingsImg.fee")}: ${waterBody.fee_per_person} €`);
  }
  if (waterBody?.contact_phone) attrLines.push(`${t("standingsImg.phone")}: ${waterBody.contact_phone}`);

  for (const raw of attrLines) {
    if (cursorY > y + h - PAD) break; // out of room — skip the rest rather than overflow the banner
    const lines = wrapLines(ctx, raw, contentW, 1);
    for (const line of lines) {
      ctx.fillText(line, contentX, cursorY);
      cursorY += 30;
    }
  }
}

/**
 * node: the DOM node to screenshot for the ranked list (same as before —
 * WaterBodyManagement.jsx/Competitions.jsx's standingsRef div).
 * competition: the Competition record (needs water_body_id, water_body_name).
 * waterBody: the matching WaterBody record, if the caller has it loaded —
 * optional; when missing, the banner still shows the name + QR, just none
 * of the extra attribute lines.
 */
export async function downloadStandingsImage({ node, competition, waterBody, filename, t }) {
  if (!node) return;

  const tableCanvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2 });
  const scale = PAGE_W / tableCanvas.width;
  const drawnTableH = Math.round(tableCanvas.height * scale);
  const tableSectionH = Math.max(PAGE_H - BANNER_H, drawnTableH);
  const totalH = tableSectionH + BANNER_H;

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, totalH);

  const tableY = Math.round((tableSectionH - drawnTableH) / 2);
  ctx.drawImage(tableCanvas, 0, tableY, PAGE_W, drawnTableH);

  await drawBanner(ctx, tableSectionH, { competition, waterBody }, t);

  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "klasirane.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
