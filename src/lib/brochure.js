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
export async function downloadInviteBrochure({ name, link, filename }) {
  const qrDataUrl = await QRCode.toDataURL(link, {
    width: 600,
    margin: 1,
    color: { dark: "#0e7490", light: "#ffffff" },
  });

  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(14, 116, 144); // cyan-700
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(22);
  doc.text("CatchCount", pageWidth / 2, 18, { align: "center" });
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  doc.text("Риболовен дневник за телефона", pageWidth / 2, 27, { align: "center" });

  // Venue/water body name
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFont(undefined, "bold");
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
  doc.setFont(undefined, "normal");
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
