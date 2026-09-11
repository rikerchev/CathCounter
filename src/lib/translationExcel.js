import * as XLSX from "xlsx";
import { DEFAULT_LANGUAGES, getLanguageNativeName } from "@/lib/languages";

// Sort: bg first, en second, then alphabetical by native_name
function sortLanguagesForExport(langCodes) {
  const rest = langCodes
    .filter((c) => c !== "bg" && c !== "en")
    .sort((a, b) => getLanguageNativeName(a).localeCompare(getLanguageNativeName(b)));
  return ["bg", "en", ...rest];
}

/**
 * Export all translations to an .xlsx file.
 * Row 1 = headers (Key, lang codes).
 * Each subsequent row = one translation key with values per language.
 */
export function exportTranslationsToExcel(allKeys, translations, dbMap) {
  const langSet = new Set(["bg", "en"]);
  Object.keys(translations).forEach((l) => langSet.add(l));
  Object.values(dbMap).forEach((rec) => {
    try {
      const vals = JSON.parse(rec.values || "{}");
      Object.keys(vals).forEach((l) => langSet.add(l));
    } catch {}
  });
  const sortedLangs = sortLanguagesForExport([...langSet]);

  const header = ["Key", ...sortedLangs];

  const rows = allKeys.map((key) => {
    const rec = dbMap[key];
    let dbValues = {};
    if (rec) {
      try { dbValues = JSON.parse(rec.values || "{}"); } catch {}
    }
    const row = [key];
    for (const lang of sortedLangs) {
      let val = dbValues[lang];
      if (!val || val === key) {
        val = translations[lang]?.[key] || translations.en[key] || "";
      }
      row.push(val || "");
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = [{ wch: 35 }, ...sortedLangs.map(() => ({ wch: 30 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Translations");
  XLSX.writeFile(wb, "translations.xlsx");
}

/**
 * Parse an uploaded Excel file into translation data.
 * Returns { importedData, fileLangCodes, langCodeByColIdx, fileLangNames }.
 * Expects: Column 0 = Key, Columns 1+ = language codes as headers.
 * Also supports legacy format with № in col 0 and Key in col 1.
 */
export function parseTranslationExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (aoa.length < 2) {
          reject(new Error("Empty file"));
          return;
        }

        const header = aoa[0];
        // Detect format: if col 0 is "Key" or a language code, new format;
        // if col 0 is "№" or numeric, legacy format with key in col 1.
        const col0 = String(header[0] || "").trim().toLowerCase();
        let keyColIdx;
        let langStartCol;

        if (col0 === "key" || DEFAULT_LANGUAGES.some((l) => l.code === col0)) {
          // New format: col 0 = Key, cols 1+ = languages
          keyColIdx = 0;
          langStartCol = 1;
        } else {
          // Legacy format: col 0 = №, col 1 = Key, cols 2+ = languages
          keyColIdx = 1;
          langStartCol = 2;
        }

        const fileLangHeaders = header.slice(langStartCol).map((h) => String(h).trim());

        // Map language headers to codes
        const langCodeByColIdx = {};
        fileLangHeaders.forEach((name, i) => {
          const colIdx = langStartCol + i;
          // Try exact language code match first
          const lowerName = name.toLowerCase();
          const codeMatch = DEFAULT_LANGUAGES.find(
            (l) => l.code === lowerName || l.code === name
          );
          if (codeMatch) {
            langCodeByColIdx[colIdx] = codeMatch.code;
            return;
          }
          // Try native name or English name match
          const found = DEFAULT_LANGUAGES.find(
            (l) => l.native_name === name || l.name === name
          );
          if (found) {
            langCodeByColIdx[colIdx] = found.code;
          } else {
            let code = lowerName.substring(0, 2);
            let suffix = 0;
            const baseCode = code;
            while (Object.values(langCodeByColIdx).includes(code)) {
              suffix++;
              code = baseCode + suffix;
            }
            langCodeByColIdx[colIdx] = code;
          }
        });

        const fileLangCodes = Object.values(langCodeByColIdx);
        const fileLangNames = fileLangHeaders;

        // Parse data rows
        const importedData = {};
        for (let i = 1; i < aoa.length; i++) {
          const row = aoa[i];
          const key = String(row[keyColIdx] || "").trim();
          if (!key) continue;
          importedData[key] = {};
          fileLangHeaders.forEach((_, idx) => {
            const colIdx = langStartCol + idx;
            const langCode = langCodeByColIdx[colIdx];
            const val = String(row[colIdx] || "").trim();
            if (val) importedData[key][langCode] = val;
          });
        }

        resolve({ importedData, fileLangCodes, langCodeByColIdx, fileLangNames });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}