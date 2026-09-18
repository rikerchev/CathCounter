import { roundRectPath, ensureBrochureFont, renderBrochureCanvas } from "./brochure";
import { getMerchantBrochureLink } from "./referral";

/**
 * downloadStandingsImage / downloadParticipantsImage — v2.91, redesigned in
 * v2.92, shared A4-style page renderer factored out in v2.94. Both are the
 * canvas-drawn PNGs behind a "Изтегли като снимка"-style button:
 * downloadStandingsImage is the competition's ranked results (sector/box,
 * points, weight); downloadParticipantsImage (new in v2.94) is the simpler
 * "who has signed up so far, in registration order" list, meant to be
 * downloaded and shared DURING registration — before there's anything to
 * rank yet — so an organizer/participant can show how many people have
 * already joined and help promote the competition. Both share the exact
 * same page shape (header, one/two-column rows on a continuous dark
 * gradient, the water body's real brochure embedded unchanged at the
 * bottom) via the internal renderRowsPage() below — only the row content
 * (drawRankedRow vs drawParticipantRow) and header text/icon differ.
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
 * - Rows are drawn one by one directly onto the canvas, split into two
 *   columns once the list is long enough that a single column would make
 *   the page unreasonably tall.
 * - The bottom of the page is the water body's actual brochure image,
 *   embedded unchanged via renderBrochureCanvas (same QR/name it already
 *   carries — nothing duplicated here).
 * - The page background behind the rows is the SAME dark gradient as the
 *   brochure's own background, so the two sections read as one continuous
 *   page; each row still sits on its own white card (the "бяла част" the
 *   organizer asked for) for legibility.
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

// v2.94 — the "who's registered so far" row: just a sequence badge (plain
// accent color, NOT the gold/silver/bronze of drawRankedRow above — this is
// registration order, not a competitive placing, so medal colors here would
// misleadingly read as "this person is winning") and the participant's
// name. Deliberately no sector/box/points/weight columns: none of that
// exists yet at registration time (sectors are drawn later, results are
// entered after weigh-in) — this list is only ever downloaded DURING
// registration, before any of it is known. The one thing that IS already
// known and worth showing is reserve status, so a reserve-slot participant
// gets a small tag instead of being indistinguishable from a main-slot one.
function drawParticipantRow(ctx, box, reg, seq, t) {
  const { x, y, w, h } = box;
  const cy = y + h / 2;

  const rcx = x + RANK_SIZE / 2;
  ctx.beginPath();
  ctx.arc(rcx, cy, RANK_SIZE / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#0e7490";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 15px Arial, sans-serif`;
  ctx.fillText(String(seq), rcx, cy + 1);

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

  let rightW = 0;
  if (reg.slot_type === "reserve") {
    const tag = t("standingsImg.reserveTag");
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#b45309";
    ctx.font = `600 12px Arial, sans-serif`;
    ctx.fillText(tag, cardX + cardW - 14, cy);
    rightW = ctx.measureText(tag).width + 20;
  }

  const leftX = cardX + 14;
  const leftMaxW = cardW - 28 - rightW;
  const nameMaxSize = h >= 62 ? 20 : 16;
  const fitted = fitFontSize(ctx, reg.participant_name || "", leftMaxW, nameMaxSize, 12, 700, "Arial, sans-serif");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1e293b";
  ctx.font = `700 ${fitted.size}px Arial, sans-serif`;
  ctx.fillText(fitted.text, leftX, cy + fitted.size * 0.32);
}

// v3.07 — the "who drew which box" row: unlike drawRankedRow (where the
// sector/box is small secondary text next to points/weight, since ranking
// is the point there), here the assigned box IS the entire point of the
// image — an organizer downloads and shares this specifically so a
// participant with no app account/social media can find their own box —
// so it's drawn large and bold on the right, not tucked away small.
//
// v3.08 — briefly dropped the leading seq circle entirely, because this
// list used to be sorted by sector+box: a "row N" badge in THAT order is
// mathematically guaranteed to equal box N (when a competition's boxes
// happen to be labeled sequentially, the common case) regardless of which
// participant landed there — which one organizer mistook for proof the
// draw wasn't actually random.
//
// v3.11 — restored, because the list itself is now sorted by REGISTRATION
// order instead (see downloadDrawResultsImage below), at the organizer's
// own follow-up request: every participant already knows their own
// registration number from the on-screen participants list
// (WaterBodyManagement.jsx's own #N badges), so they can jump straight to
// their row by that number instead of scanning 28+ names for their own —
// and now that the sort key is registration order, not box order, this
// badge is genuinely their own number again, not a tautological echo of
// the box label next to it.
function drawDrawResultRow(ctx, box, reg, seq, t) {
  const { x, y, w, h } = box;
  const cy = y + h / 2;

  const rcx = x + RANK_SIZE / 2;
  ctx.beginPath();
  ctx.arc(rcx, cy, RANK_SIZE / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#0e7490";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 15px Arial, sans-serif`;
  ctx.fillText(String(seq), rcx, cy + 1);

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

  const boxLabel = reg.assigned_box != null
    ? `${reg.assigned_sector ? `${reg.assigned_sector}/` : ""}${reg.assigned_box}`
    : "—";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0e7490";
  const rightMaxW = w * 0.4;
  const fittedBox = fitFontSize(ctx, boxLabel, rightMaxW, 22, 14, 800, "Arial, sans-serif");
  ctx.font = `800 ${fittedBox.size}px Arial, sans-serif`;
  ctx.fillText(fittedBox.text, cardX + cardW - 14, cy);
  const rightW = ctx.measureText(fittedBox.text).width + 24;

  const leftX = cardX + 14;
  const leftMaxW = cardW - 28 - rightW;
  const nameMaxSize = h >= 62 ? 18 : 15;
  const fitted = fitFontSize(ctx, reg.participant_name || "", leftMaxW, nameMaxSize, 12, 700, "Arial, sans-serif");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1e293b";
  ctx.font = `700 ${fitted.size}px Arial, sans-serif`;
  ctx.fillText(fitted.text, leftX, cy + fitted.size * 0.32);
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

// v2.94 — generalized from v2.93's drawHeader: now takes the emoji/icon and
// the already-composed label text, so both the standings header ("🏆
// Класиране — …") and the participants-list header ("📋 Записани
// участници — …") share the same drawing code.
async function drawHeader(ctx, box, icon, text, t) {
  await ensureBrochureFont();
  const { x, y, w, h } = box;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px Arial, sans-serif`;
  ctx.fillText(icon, x, y + h * 0.62);
  const fitted = fitFontSize(ctx, text, w - 52, 30, 18, 700, `"CatchCountBrochure", Arial, sans-serif`);
  ctx.font = `700 ${fitted.size}px "CatchCountBrochure", Arial, sans-serif`;
  ctx.fillText(fitted.text, x + 46, y + h * 0.62);
}

// v2.94 — the shared page-building/download core behind both
// downloadStandingsImage and downloadParticipantsImage: layout (one/two
// columns, A4-target height, continuous background), the real brochure
// embedded at the bottom, and the final PNG download. `drawRow(ctx, box, i)`
// draws row `i` of `rowCount` total rows into `box`; everything else about
// the page (header, brochure, background) is identical between the two
// callers.
async function renderRowsPage({
  rowCount, drawRow, headerIcon, headerText, emptyMessage,
  competition, waterBody, filename,
}) {
  const colCount = rowCount > COLUMN_SPLIT_THRESHOLD ? 2 : 1;
  const rowH = colCount === 2 ? 58 : 66;
  const rowsPerCol = Math.max(1, Math.ceil(rowCount / colCount));
  const listH = rowCount > 0 ? rowsPerCol * (rowH + ROW_GAP) - ROW_GAP : 40;
  const topContentH = HEADER_H + listH + PAD * 2;

  let brochureCanvas = null;
  if (competition?.water_body_id) {
    try {
      brochureCanvas = await renderBrochureCanvas({
        link: getMerchantBrochureLink("water_body", competition.water_body_id),
        name: waterBody?.name || competition?.water_body_name || "",
      });
    } catch {
      brochureCanvas = null; // template asset failed to load — the list alone still works
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
  // section) — same colors as the brochure's own background — so the list
  // and the embedded brochure read as one page, not two stacked blocks.
  const gradient = ctx.createLinearGradient(0, 0, 0, totalH);
  gradient.addColorStop(0, BG_TOP);
  gradient.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_W, totalH);

  await drawHeader(ctx, { x: PAD, y: PAD, w: PAGE_W - PAD * 2, h: HEADER_H }, headerIcon, headerText);

  if (rowCount === 0) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `400 18px Arial, sans-serif`;
    ctx.fillText(emptyMessage, PAD, PAD + HEADER_H + 30);
  } else {
    const listTop = PAD + HEADER_H;
    const colW = colCount === 2 ? (PAGE_W - PAD * 2 - GUTTER) / 2 : PAGE_W - PAD * 2;
    for (let i = 0; i < rowCount; i++) {
      const col = colCount === 2 ? Math.floor(i / rowsPerCol) : 0;
      const rowInCol = colCount === 2 ? i % rowsPerCol : i;
      const rowX = PAD + col * (colW + GUTTER);
      const rowY = listTop + rowInCol * (rowH + ROW_GAP);
      drawRow(ctx, { x: rowX, y: rowY, w: colW, h: rowH }, i);
    }
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
  const dateLabel = formatCompetitionDate(competition?.date, lang);
  const headerText = `${t("wb.standings")} — ${title || ""}${dateLabel ? `, ${dateLabel}` : ""}`;
  await renderRowsPage({
    rowCount: list.length,
    drawRow: (ctx, box, i) => drawRankedRow(ctx, box, list[i], t),
    headerIcon: "🏆",
    headerText,
    emptyMessage: t("wb.noResultsYet"),
    competition,
    waterBody,
    filename,
  });
}

/**
 * downloadParticipantsImage — v2.94. Same page shape as
 * downloadStandingsImage (see this module's own top comment), but for the
 * "who has signed up so far" list — meant to be downloaded and shared
 * DURING registration, before there's a draw or any results, so a
 * participant/organizer can show how many people have already joined and
 * help promote the competition on social media.
 *
 * registrations: the competition's active registrations (main + reserve),
 * in ANY order — this function itself sorts them into registration order
 * (list_order_at || created_at ascending, same rule as the numbered
 * participants list in WaterBodyManagement.jsx's own dialog — v2.90) and
 * numbers them continuously across main+reserve.
 * title/competition/waterBody/filename/t/lang — same as downloadStandingsImage.
 */
export async function downloadParticipantsImage({ registrations, title, competition, waterBody, filename, t, lang }) {
  const list = (registrations || [])
    .slice()
    .sort((a, b) => new Date(a.list_order_at || a.created_at) - new Date(b.list_order_at || b.created_at));
  const dateLabel = formatCompetitionDate(competition?.date, lang);
  const headerText = `${t("standingsImg.participantsTitle")} — ${title || ""}${dateLabel ? `, ${dateLabel}` : ""}`;
  await renderRowsPage({
    rowCount: list.length,
    drawRow: (ctx, box, i) => drawParticipantRow(ctx, box, list[i], i + 1, t),
    headerIcon: "📋",
    headerText,
    emptyMessage: t("wb.noParticipantsYet"),
    competition,
    waterBody,
    filename,
  });
}

/**
 * downloadDrawResultsImage — v3.07, resorted in v3.11. Same shared page
 * shape again, this time for "who drew which box" — meant to be downloaded
 * and shared right after the organizer runs "Тегли жребий", specifically so
 * participants with no app account and no presence on social media can
 * still find out (and be shown proof of) their own assignment.
 *
 * registrations: the competition's active registrations (main + reserve —
 * the SAME set WaterBodyManagement.jsx's on-screen participants dialog
 * numbers as #1, #2, ...); only the ones with a drawn box
 * (assigned_box != null) actually get a row here, but the registration
 * NUMBER shown next to each row (see seqById below) is computed over the
 * FULL list first, then filtered — so it's always the exact same number
 * that participant already sees next to their own name in that on-screen
 * list, not a renumbering of just the drawn subset.
 *
 * v3.11 — sorted by registration order (list_order_at || created_at), not
 * sector/box: the organizer's own follow-up request, since every
 * participant already knows the number they registered under and can jump
 * straight to their own row by it — scanning a box-sorted seating chart for
 * one name out of 28+ doesn't scale nearly as well as looking up a known
 * number does.
 */
export async function downloadDrawResultsImage({ registrations, title, competition, waterBody, filename, t, lang }) {
  const allOrdered = (registrations || [])
    .slice()
    .sort((a, b) => new Date(a.list_order_at || a.created_at) - new Date(b.list_order_at || b.created_at));
  const seqById = new Map(allOrdered.map((r, i) => [r.id, i + 1]));
  const list = allOrdered.filter((r) => r.assigned_box != null);
  const dateLabel = formatCompetitionDate(competition?.date, lang);
  const headerText = `${t("standingsImg.drawResultsTitle")} — ${title || ""}${dateLabel ? `, ${dateLabel}` : ""}`;
  await renderRowsPage({
    rowCount: list.length,
    drawRow: (ctx, box, i) => drawDrawResultRow(ctx, box, list[i], seqById.get(list[i].id), t),
    headerIcon: "🎲",
    headerText,
    emptyMessage: t("wb.noResultsYet"),
    competition,
    waterBody,
    filename,
  });
}
