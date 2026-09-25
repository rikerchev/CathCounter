// src/lib/competitionExcel.js — v3.69
//
// xlsx export/import of a competition's full RESULTS table (catch weights,
// penalty points, standings) — requested verbatim by the site owner as a
// standalone feature next to the existing plain-participant CSV export
// (exportParticipantsCsv in WaterBodyManagement.jsx, left unchanged — that
// one is just a name/phone/slot/box list, this one is the scored results
// table). Reuses the same "xlsx" library already used elsewhere in this app
// (src/lib/excelUtils.js, src/lib/translationExcel.js) — no new dependency.
//
// Row shape: one row per (participant, round/"манш") — confirmed with the
// site owner, since their column spec (one "Кантарни риби"/"Улов"/"Общ
// улов"/"Наказателни точки" column each, no round breakdown) only
// unambiguously describes a single-round competition. For a multi-round
// one, every participant gets one row per манш, with its own "Манш" column
// — omitted entirely when the competition has only 1 round, matching the
// literal column list given. "Наказателни точки" on each row is that
// round's own sector points (see competitionResults.js's roundSectorPoints
// — a real, already-existing per-round number). "Класиране" is the
// participant's OVERALL rank across every round (rankByPenaltyAndWeight)
// and is simply repeated on every one of that participant's rows.
//
// Two catch categories, per the site owner's request: "Кантарни риби" (fish
// weighed on the scale immediately after the catch and released right
// away) is the NEW CompetitionRegistration.catch_results_scale column;
// "Улов" (the keep-net catch) is the pre-existing catch_results column,
// untouched in meaning. "Общ улов" is always their sum, computed here for
// display — never itself stored or importable. Same for "Наказателни
// точки" and "Класиране": always computed fresh from whatever weights are
// on record, never read back from the file on import.
import * as XLSX from "xlsx";
import { maskEmail } from "./emailMask";
import { parseSectorsConfig, allBoxes } from "./competitionSectors";
import {
  parseCatchResults, stringifyCatchResults, roundSectorPoints, rankByPenaltyAndWeight,
} from "./competitionResults";

// Column headers are fixed, plain-Bulgarian constants — deliberately NOT
// routed through t() — so a file exported while the app is showing one
// language can always be correctly re-imported regardless of which
// language happens to be active at import time (importCompetitionResults
// below matches columns by these exact labels).
const COL = {
  id: "ID",
  no: "№",
  name: "Име",
  phone: "Тел. номер",
  user: "Потребител",
  place: "Място",
  round: "Манш",
  scale: "Кантарни риби (кг)",
  catchNet: "Улов (кг)",
  total: "Общ улов (кг)",
  penalty: "Наказателни точки",
  rank: "Класиране",
};

// "когато има само един сектор изписваш само номера на бокса" (the site
// owner's own wording) — and a " *" suffix whenever the placement came from
// this same import feature rather than the organizer's system draw
// (box_manual — see the matching column comment in entities.generated.ts).
function placeLabel(r, sectorsCount) {
  if (r.assigned_box == null) return "";
  const label = sectorsCount <= 1 ? String(r.assigned_box) : `${r.assigned_sector} — ${r.assigned_box}`;
  return r.box_manual ? `${label} *` : label;
}

function orderedRegs(registrations) {
  return (registrations || []).slice().sort((a, b) =>
    new Date(a.list_order_at || a.created_at) - new Date(b.list_order_at || b.created_at)
  );
}

export function exportCompetitionResultsExcel(comp, registrations) {
  const roundsCount = Math.max(1, comp?.rounds_count || 1);
  const sectors = parseSectorsConfig(comp?.sectors_config);
  const regs = orderedRegs(registrations);
  const rankedMap = new Map(rankByPenaltyAndWeight(regs, roundsCount).map((x) => [x.id, x]));
  const roundPointsMatrix = Array.from({ length: roundsCount }, (_, i) => roundSectorPoints(regs, i));

  const header = [COL.id, COL.no, COL.name, COL.phone, COL.user, COL.place];
  if (roundsCount > 1) header.push(COL.round);
  header.push(COL.scale, COL.catchNet, COL.total, COL.penalty, COL.rank);

  const rows = [];
  regs.forEach((r, idx) => {
    const scaleArr = parseCatchResults(r.catch_results_scale);
    const catchArr = parseCatchResults(r.catch_results);
    const ranked = rankedMap.get(r.id);
    for (let i = 0; i < roundsCount; i++) {
      const scale = scaleArr[i];
      const catchW = catchArr[i];
      const hasEither = scale != null || catchW != null;
      const total = hasEither ? (scale || 0) + (catchW || 0) : null;
      const pts = roundPointsMatrix[i].get(r.id);
      const row = [
        r.id,
        idx + 1,
        r.participant_name || "",
        r.participant_phone || "",
        r.registered_by_email ? maskEmail(r.registered_by_email) : "",
        placeLabel(r, sectors.length),
      ];
      if (roundsCount > 1) row.push(i + 1);
      row.push(
        scale != null ? scale : "",
        catchW != null ? catchW : "",
        total != null ? total : "",
        typeof pts === "number" ? pts : "",
        ranked ? ranked.rank : ""
      );
      rows.push(row);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...(rows.length > 0 ? rows : [header.map(() => "")])]);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(String(h).length + 2, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Резултати");
  const filename = `rezultati-${(comp?.title || "sastezanie").toLowerCase().replace(/[^a-z0-9а-я]+/gi, "-")}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Parses an uploaded .xlsx file's first sheet into an array of row objects
// keyed by the header labels above — same reader pattern as
// excelUtils.js's own parseExcelFile.
export function parseCompetitionResultsExcelFile(file) {
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

// "Мястото също може да се попълни, ако жребия не е изтеглен от системата,
// но се отбелязва със звездичка, ако е попълнено ръчно" — parses the same
// "Sector — Box" / "Box"(single-sector) / "...*" text this module's own
// export produces. Returns null for anything it can't confidently parse
// (left untouched rather than guessed at).
function parsePlaceCell(raw, sectors) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const manual = s.endsWith("*");
  const clean = (manual ? s.slice(0, -1) : s).trim();
  if (!clean) return null;
  if (sectors.length <= 1) {
    const soleSector = sectors[0]?.name || "";
    return { sector: soleSector, box: clean };
  }
  const parts = clean.split(/\s*[—-]\s*/);
  if (parts.length < 2) return null;
  const box = parts[parts.length - 1].trim();
  const sector = parts.slice(0, -1).join(" - ").trim();
  return sector && box ? { sector, box } : null;
}

function isValidBox(sectors, sector, box) {
  if (sectors.length === 0) return true; // nothing configured to validate against — accept as given
  return allBoxes(sectors).some((b) => b.sector === sector && b.box === box);
}

// Builds the CompetitionRegistration.bulkUpdate payload from a parsed xlsx
// file. `registrations` must be the CURRENT list for this exact competition
// — a row whose ID column doesn't match one of them is skipped outright
// (wrong competition's file, a row for a since-deleted registration, or a
// blank/corrupted ID cell): this import only ever fills in data for
// registrations that already exist, it never creates one.
//
// Per round, per registration: "Кантарни риби"/"Улов" are SET directly from
// the file's cells (blank cell -> null in the app, exactly as the site
// owner asked — "ако не е попълнено нищо... остава празна"), for every
// round that actually has a row in the file; a round with no row at all for
// that participant (the file was hand-edited to drop it) is left as
// whatever was already saved. "Общ улов"/"Наказателни точки"/"Класиране"
// are never read from the file — always recomputed. "Място" is only ever
// taken from the file for a registration that doesn't already have a
// system-assigned box (жребий not drawn yet) — see box_manual.
export function buildCompetitionResultsImport(rows, comp, registrations) {
  const roundsCount = Math.max(1, comp?.rounds_count || 1);
  const sectors = parseSectorsConfig(comp?.sectors_config);
  const byId = new Map((registrations || []).map((r) => [r.id, r]));

  const perReg = new Map();
  let matchedRows = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = String(row[COL.id] ?? "").trim();
    const reg = id ? byId.get(id) : null;
    if (!reg) { skipped++; continue; }
    matchedRows++;

    const roundIdx = roundsCount > 1
      ? Math.max(1, Math.min(roundsCount, Number(row[COL.round]) || 1)) - 1
      : 0;

    if (!perReg.has(id)) {
      perReg.set(id, {
        scale: Array.from({ length: roundsCount }, () => undefined),
        catchArr: Array.from({ length: roundsCount }, () => undefined),
        place: undefined,
      });
    }
    const entry = perReg.get(id);

    const scaleRaw = row[COL.scale];
    let scaleVal = scaleRaw === "" || scaleRaw == null ? null : Number(scaleRaw);
    if (Number.isNaN(scaleVal)) scaleVal = null;
    entry.scale[roundIdx] = scaleVal;

    const catchRaw = row[COL.catchNet];
    let catchVal = catchRaw === "" || catchRaw == null ? null : Number(catchRaw);
    if (Number.isNaN(catchVal)) catchVal = null;
    entry.catchArr[roundIdx] = catchVal;

    // Only read once per registration (the export repeats the same place
    // text on every round-row) and only when the draw hasn't happened yet.
    if (entry.place === undefined && reg.assigned_box == null) {
      const parsed = parsePlaceCell(row[COL.place], sectors);
      entry.place = parsed && isValidBox(sectors, parsed.sector, parsed.box) ? parsed : null;
    }
  }

  const updates = [];
  for (const [id, entry] of perReg) {
    const reg = byId.get(id);
    const payload = { id };
    let changed = false;

    const mergedScale = parseCatchResults(reg.catch_results_scale);
    const mergedCatch = parseCatchResults(reg.catch_results);
    for (let i = 0; i < roundsCount; i++) {
      if (entry.scale[i] !== undefined) { mergedScale[i] = entry.scale[i]; changed = true; }
      if (entry.catchArr[i] !== undefined) { mergedCatch[i] = entry.catchArr[i]; changed = true; }
    }
    if (changed) {
      payload.catch_results_scale = stringifyCatchResults(mergedScale);
      payload.catch_results = stringifyCatchResults(mergedCatch);
    }
    if (entry.place) {
      payload.assigned_sector = entry.place.sector;
      payload.assigned_box = entry.place.box;
      payload.box_manual = true;
      changed = true;
    }
    if (changed) updates.push(payload);
  }

  return { updates, matchedRows, skipped, touchedCount: updates.length };
}
