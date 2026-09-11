import * as XLSX from "xlsx";

/**
 * Export array of objects to an .xlsx file and trigger download.
 * @param {Array<Object>} data - rows to export
 * @param {string} filename - e.g. "users.xlsx"
 * @param {string} sheetName - worksheet tab name
 */
export function exportToExcel(data, filename, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Export multiple sheets into one .xlsx file.
 * @param {Array<{sheetName: string, data: Array<Object>}>} sheets
 * @param {string} filename
 */
export function exportMultiSheetExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.data.length > 0 ? s.data : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName);
  }
  XLSX.writeFile(wb, filename);
}

/**
 * Export multiple sheets with column labels and hint comments.
 * Even if data is empty, a template row with headers + comments is generated.
 * @param {Array<{sheetName: string, columns: Array<{key, label, hint?, type?}>, data: Array<Object>}>} sheets
 * @param {string} filename
 */
export function exportWithHints(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const columns = s.columns || [];
    const data = s.data || [];

    // Header row with Bulgarian labels
    const header = columns.map(c => c.label);

    // Data rows — map entity fields to column order, convert booleans
    const rows = data.map(entity =>
      columns.map(col => {
        let val = entity[col.key];
        if (col.type === "boolean" && val !== undefined && val !== null && val !== "") {
          val = val ? "Да" : "Не";
        }
        return val ?? "";
      })
    );

    // If no data, add one empty template row so the file isn't blank
    const allRows = rows.length > 0 ? rows : [columns.map(() => "")];

    // Build worksheet from array-of-arrays
    const ws = XLSX.utils.aoa_to_sheet([header, ...allRows]);

    // Set column widths based on label length
    ws["!cols"] = columns.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));

    XLSX.utils.book_append_sheet(wb, ws, s.sheetName);
  }
  XLSX.writeFile(wb, filename);
}

/**
 * Parse an uploaded Excel/CSV file into an array of objects (first sheet).
 * @param {File} file
 * @returns {Promise<Array<Object>>}
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse an uploaded Excel file into an object keyed by sheet name.
 * @param {File} file
 * @returns {Promise<Record<string, Array<Object>>>}
 */
export function parseMultiSheetExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const result = {};
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          result[name] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Map a parsed row (keyed by column label) back to an entity object (keyed by field key).
 * Handles boolean and number type conversions.
 * @param {Object} row - parsed row with Bulgarian labels as keys
 * @param {Array<{key, label, hint?, type?}>} columns
 * @returns {Object} entity object
 */
export function rowToEntity(row, columns) {
  const entity = {};
  for (const col of columns) {
    const val = row[col.label];
    if (val === undefined || val === "") continue;
    if (col.key === "id") {
      entity.id = String(val).trim();
    } else if (col.type === "boolean") {
      entity[col.key] = val === "Да" || val === "true" || val === true;
    } else if (col.type === "number") {
      entity[col.key] = parseFloat(val) || 0;
    } else {
      entity[col.key] = val;
    }
  }
  return entity;
}