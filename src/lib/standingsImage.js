import { roundRectPath, ensureBrochureFont, renderBrochureCanvas } from "./brochure";
import { getMerchantBrochureLink } from "./referral";

/**
 * downloadStandingsImage — v2.91, redesigned in v2.92. The competition
 * standings PNG (the "Изтегли като снимка" button in both
 * WaterBodyManagement.jsx and Competitions.jsx's standings dialogs).
 *
 * v2.91 first shipped this as an html2canvas screenshot of the on-screen
 * dialog with a hand-drawn banner glued underneath. Both were wrong in
 * practice: html2canvas, screenshotting a node inside a scrollable
 * "max-h-[85vh] overflow-y-auto" dialog, produced a badly clipped, far-too-
 * tall image (nowhere near A4) with names cut off; and the organizer's
 * actual ask was to embed the REAL per-water-body brochure (the exact
 * output of downloadInviteBrochure/renderBrochureCanvas — golden-fish
 * photo, phone mockups, this water body's own QR baked in) at the bottom,
 * not a custom-drawn approximation of it.
 *
 * v2.92 draws the whole page itself instead of screenshotting DOM:
 * - The ranked list is drawn row by row directly onto the canvas (rank
 *   badge, name auto-shrunk to always fit on one line, sector/box moved
 *   next to the name instead of below it, points/weight on the right),
 *   split into two columns once the list is long enough that a single
 *   column would make the page unreasonably tall.
 * - The bottom of the page is the water body's actual brochure image,
 *   embedded unchanged via renderBrochureCanvas (same QR/name it already
 *   carries — nothing duplicated here).
 * - The page background behind the ranked list is the SAME dark gradient
 *   as the brochure's own background, so the two sections read as one
 *   continuous page; each ranked row still sits on its own white card
 *   (the "бяла част" the organizer asked for) for legibility.
 *
 * Full control over layout is exactly why this no longer goes through
 * html2canvas at all — a live DOM screenshot can't be reliably forced into
 * fixed row heights, a two-column split, or a guaranteed one-line name.
 */

const PAGE_W = 1240; // A4 width @ ~150dpi
const PAGE_TARGET_H = 1754; // A4 height @ ~150dpi — the target when content is short
const PAD = 40;
const HEADER_H = 96;
const GUTTER = 28;
const ROW_GAP = 10;
const RANK_SIZE = 34;
// More rows than this and a single column would make the page unreasonably
// tall — switch to two columns (ranks 1..N/2 in the left column, the rest
// continuing in the right one) instead.
const COLUMN_SPLIT_THRESHOLD = 12;

const BG_TOP = "#0b1f33";
const BG_BOTTOM = "#0e3a52";

function fitFontSize(ctx, text, maxWidth, maxSize, minSize, weight, family) {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { size, text };
  // Still doesn't fit even at the minimum size (an extremely long name) —
  // ellipsize as a last-resort safety net rather than overflow the card.
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return { size, text: `${t}…` };
}

function rankColors(rank) {
  if (rank === 1) return { bg: "#fbbf24", fg: "#ffffff" };
  if (rank === 2) return { bg: "#cbd5e1", fg: "#334155" };
  if (rank === 3) return { bg: "#b45309", fg: "#ffffff" };
  return { bg: "#e2e8f0", fg: "#64748b" };
}

function drawRankedRow(ctx, box, r, t) {
  const { x, y, w, h } = box;
  const cy = y + h / 2;

  // Rank badge, left of the card.
  const { bg, fg } = rankColors(r.rank);
  const rcx = x + RANK_SIZE / 2;
  ctx.beginPath();
  ctx.arc(rcx, cy, RANK_SIZE / 2, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fg;
  ctx.font = `700 15px Arial, sans-serif`;
  ctx.fillText(String(r.rank), rcx, cy + 1);

  // White card — the "бяла част" the ranked list sits in, against the
  // page's dark background.
  const cardX = x + RANK_SIZE + 10;
  const cardW = w - RANK_SIZE - 10;
  ctx.save();
  ctx.shadowColor = "rgba(8, 15, 28, 0.25)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRectPath(ctx, cardX, y, cardW, h, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Right side: penalty points + total weight, stacked, right-aligned.
  const rightW = 96;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#4338ca";
  ctx.font = `700 15px Arial, sans-serif`;
  ctx.fillText(`${r.penalty} ${t("comp.pointsUnit")}`, cardX + cardW - 14, cy - 3);
  ctx.fillStyle = "#b45309";
  ctx.font = `600 12px Arial, sans-serif`;
  ctx.fillText(`${r.total} ${t("wb.kg")}`, cardX + cardW - 14, cy + 14);

  // Left side: name + sector/box on the SAME line (moved next to the name
  // instead of on a second line — see this module's own comment above),
  // name auto-shrunk so it always fits without being cut off.
  const leftX = cardX + 14;
  const leftMaxW = cardW - 28 - rightW;
  const sectorBox = r.assigned_box != null ? `${r.assigned_sector}/${r.assigned_box}` : "";
  ctx.font = `600 12px Arial, sans-serif`;
  const sbWidth = sectorBox ? ctx.measureText(sectorBox).width + 10 : 0;
  const nameMaxW = Math.max(30, leftMaxW - sbWidth);
  const nameMaxSize = h >= 62 ? 18 : 15;
  const fitted = fitFontSize(ctx, r.participant_name || "", nameMaxW, nameMaxSize, 12, 700, "Arial, sans-serif");
  ctx.textAlign = "left";
  ctx.fillStyle = "#1e293b";
  ctx.font = `700 ${fitted.size}px Arial, sans-serif`;
  ctx.fillText(fitted.text, leftX, cy + fitted.size * 0.32);

  if (sectorBox) {
    const nameW = ctx.measureText(fitted.text).width;
    ctx.font = `600 12px Arial, sans-serif`;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(sectorBox, leftX + nameW + 10, cy + 4);
  }
}

// v2.93 — the competition's own date (comp.date, an ISO string), formatted
// the same way the on-screen pages already show it (WaterBodyManagement.jsx
// / Competitions.jsx's own local formatDate — day/month/year only here,
// since the header line is about identifying WHICH competition this is, not
// exact kickoff time).
function formatCompetitionDate(date, lang) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function drawHeader(ctx, box, title, dateLabel, t) {
  await ensureBrochureFont();
  const { x, y, w, h } = box;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px Arial, sans-serif`;
  ctx.fillText("🏆", x, y + h * 0.62);
  const label = `${t("wb.standings")} — ${title || ""}${dateLabel ? `, ${dateLabel}` : ""}`;
  const fitted = fitFontSize(ctx, label, w - 52, 30, 18, 700, `"CatchCountBrochure", Arial, sans-serif`);
  ctx.font = `700 ${fitted.size}px "CatchCountBrochure", Arial, sans-serif`;
  ctx.fillText(fitted.text, x + 46, y + h * 0.62);
}

/**
 * ranked: the array from rankByPenaltyAndWeight (id, participant_name,
 * assigned_sector, assigned_box, rank, penalty, total) — caller already has
 * this computed for the on-screen dialog.
 * title: the competition's title, shown in the header.
 * competition: needs water_body_id (for the brochure's QR) and, as a
 * fallback, water_body_name.
 * waterBody: the matching WaterBody record, if loaded — its own `name` is
 * preferred for the brochure label; optional.
 * lang: current UI language ("bg"/"en"), used only to format competition.date
 * (v2.93) the same way the on-screen pages do; optional, defaults to "bg".
 */
export async function downloadStandingsImage({ ranked, title, competition, waterBody, filename, t, lang }) {
  const list = ranked || [];
  const colCount = list.length > COLUMN_SPLIT_THRESHOLD ? 2 : 1;
  const rowH = colCount === 2 ? 58 : 66;
  const rowsPerCol = Math.max(1, Math.ceil(list.length / colCount));
  const listH = list.length > 0 ? rowsPerCol * (rowH + ROW_GAP) - ROW_GAP : 40;
  const topContentH = HEADER_H + listH + PAD * 2;

  let brochureCanvas = null;
  if (competition?.water_body_id) {
    try {
      brochureCanvas = await renderBrochureCanvas({
        link: getMerchantBrochureLink("water_body", competition.water_body_id),
        name: waterBody?.name || competition?.water_body_name || "",
      });
    } catch {
      brochureCanvas = null; // template asset failed to load — standings alone still work
    }
  }
  const brochureH = brochureCanvas ? Math.round((PAGE_W * brochureCanvas.height) / brochureCanvas.width) : 0;

  // A4-shaped when the list is short: the top section is padded up to fill
  // what would be "the rest of the page" above the brochure. A long list is
  // never shrunk to force that — the page just grows taller instead.
  const targetTopH = Math.max(0, PAGE_TARGET_H - brochureH);
  const topH = Math.max(targetTopH, topContentH);
  const totalH = topH + brochureH;

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");

  // One continuous dark gradient behind the WHOLE page (not just the top
  // section) — same colors as the brochure's own background — so the
  // ranked list and the embedded brochure read as one page, not two
  // stacked blocks.
  const gradient = ctx.createLinearGradient(0, 0, 0, totalH);
  gradient.addColorStop(0, BG_TOP);
  gradient.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_W, totalH);

  const dateLabel = formatCompetitionDate(competition?.date, lang);
  await drawHeader(ctx, { x: PAD, y: PAD, w: PAGE_W - PAD * 2, h: HEADER_H }, title, dateLabel, t);

  if (list.length === 0) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `400 18px Arial, sans-serif`;
    ctx.fillText(t("wb.noResultsYet"), PAD, PAD + HEADER_H + 30);
  } else {
    const listTop = PAD + HEADER_H;
    const colW = colCount === 2 ? (PAGE_W - PAD * 2 - GUTTER) / 2 : PAGE_W - PAD * 2;
    list.forEach((r, i) => {
      const col = colCount === 2 ? Math.floor(i / rowsPerCol) : 0;
      const rowInCol = colCount === 2 ? i % rowsPerCol : i;
      const rowX = PAD + col * (colW + GUTTER);
      const rowY = listTop + rowInCol * (rowH + ROW_GAP);
      drawRankedRow(ctx, { x: rowX, y: rowY, w: colW, h: rowH }, r, t);
    });
  }

  if (brochureCanvas) {
    ctx.drawImage(brochureCanvas, 0, topH, PAGE_W, brochureH);
  }

  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "klasirane.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
