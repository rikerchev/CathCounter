import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * downloadInviteBrochure — v2.69. A small, printable A5 flyer for a water
 * body or commercial venue: its name + a QR code that encodes it directly
 * (server/routes/merchantReferrals.ts — no GPS/location guessing). Pin it up
 * or hand it out; every new account that registers through it can earn that
 * merchant free banner-advertising time, if the owner/admin has configured
 * a bonus (0 days / no banner by default — see MerchantBonusEditor.jsx).
 *
 * Fully client-side (no server round trip beyond the id already known) —
 * uses the same `qrcode` package as ReferralCard.jsx and jsPDF, already a
 * dependency for this app's other exports.
 */

// v2.70 fix — jsPDF's built-in fonts (Helvetica/Times/Courier) only cover
// WinAnsi/Latin-1, NOT Cyrillic. Every Bulgarian character in this flyer
// ("Риболовен дневник...", "Сканирайте...", any venue name a trader types
// in) was silently getting reinterpreted as some unrelated Latin glyph —
// the garbled "81>;>25=..." text a user actually saw when they opened the
// downloaded PDF. jsPDF needs a real embedded TTF with a Cyrillic cmap to
// render this correctly at all; there is no built-in "just support Unicode"
// mode. These two files are DejaVu Sans (public-domain-style Bitstream Vera
// license — free to embed/redistribute) subset down to Latin + Latin-1 +
// Cyrillic + the handful of punctuation marks this flyer uses (~85KB each
// instead of DejaVu's original ~750KB), fetched once per brochure download
// and cached by the browser afterwards like any other static asset.
const FONT_FAMILY = "CatchCountBrochure";
const FONT_REGULAR_URL = "/fonts/CatchCountBrochure-Regular.ttf";
const FONT_BOLD_URL = "/fonts/CatchCountBrochure-Bold.ttf";

async function fetchFontBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // btoa() needs a plain string, and a spread/apply over a ~90KB byte array
  // can blow the call-stack argument limit in some browsers — build it in
  // chunks instead.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

let fontLoadPromise = null;
function loadBrochureFonts(doc) {
  if (!fontLoadPromise) {
    fontLoadPromise = Promise.all([
      fetchFontBase64(FONT_REGULAR_URL),
      fetchFontBase64(FONT_BOLD_URL),
    ]);
  }
  return fontLoadPromise.then(([regularBase64, boldBase64]) => {
    doc.addFileToVFS(`${FONT_FAMILY}-Regular.ttf`, regularBase64);
    doc.addFont(`${FONT_FAMILY}-Regular.ttf`, FONT_FAMILY, "normal");
    doc.addFileToVFS(`${FONT_FAMILY}-Bold.ttf`, boldBase64);
    doc.addFont(`${FONT_FAMILY}-Bold.ttf`, FONT_FAMILY, "bold");
  });
}

export async function downloadInviteBrochure({ name, link, filename }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 600,
    // v2.69 fix — was 1 module, under the ~4-module "quiet zone" most phone
    // cameras need to even detect a QR code, let alone decode it (see the
    // matching fix/comment in ReferralCard.jsx). Printed material makes this
    // worse, not better — more reasons for a bad angle/lighting/distance.
    margin: 4,
    // Level H (~30% error correction) — more tolerant of a slightly
    // off-angle phone, print/ink imperfections, or a worn/creased flyer
    // than the default M (~15%). Matches ReferralCard.jsx.
    errorCorrectionLevel: "H",
    // Plain black/white instead of cyan-on-white — true black reads as
    // higher-contrast to a phone camera's QR detector than a colored tone,
    // which matters more on paper (lighting/ink variance) than the exact
    // brand color. Matches ReferralCard.jsx.
    color: { dark: "#000000", light: "#ffffff" },
  });

  const doc = new jsPDF({ unit: "mm", format: "a5" });
  await loadBrochureFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(14, 116, 144); // cyan-700
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(22);
  doc.text("CatchCount", pageWidth / 2, 18, { align: "center" });
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(10);
  doc.text("Риболовен дневник за телефона", pageWidth / 2, 27, { align: "center" });

  // Venue/water body name
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(15);
  const nameLines = doc.splitTextToSize(name || "", pageWidth - 24);
  doc.text(nameLines, pageWidth / 2, 52, { align: "center" });

  // QR code
  const qrSize = 78;
  const qrY = 62;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect((pageWidth - qrSize - 8) / 2, qrY - 4, qrSize + 8, qrSize + 8, 3, 3, "S");
  doc.addImage(qrDataUrl, "PNG", (pageWidth - qrSize) / 2, qrY, qrSize, qrSize);

  // Footer copy
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105); // slate-500
  const footerY = qrY + qrSize + 14;
  doc.text("Сканирайте с камерата на телефона,", pageWidth / 2, footerY, { align: "center" });
  doc.text("за да изтеглите приложението", pageWidth / 2, footerY + 6, { align: "center" });

  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("catchcount.app4.you", pageWidth / 2, pageHeight - 10, { align: "center" });

  doc.save(filename || "catchcount-broshura.pdf");
}
