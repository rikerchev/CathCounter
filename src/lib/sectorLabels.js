// src/lib/sectorLabels.js — v2.96, revised v3.04
//
// Custom box/sector labels for the GENERAL (non-competition) reservation
// system — SectorAvailability / SectorReservation, used by
// WaterBodyManagement.jsx's sector declaration form and SectorReservations.jsx.
//
// v3.04 — the water body owner can now group boxes into named SECTORS, same
// {name, boxes} model as the competition system's Competition.sectors_config
// (see src/lib/competitionSectors.js) — reusing its parseSectorsConfig/
// stringifySectorsConfig/totalBoxes directly rather than duplicating them.
// Before v3.04 this system only had a single flat list of boxes (box_labels,
// v2.96) or, before that, a plain box COUNT with automatic 1..N numbering
// (total_sectors alone). All three shapes stay readable forever — see
// sectorGroupsFor's fallback chain below — so no existing water body's data
// ever needs to be migrated or re-entered.
//
// SectorReservation has no separate "which sector group" column of its own
// (unlike CompetitionRegistration's paired assigned_sector + assigned_box),
// so when there is more than one named sector, each box's EFFECTIVE label —
// the one actually shown to the customer and stored on
// SectorReservation.sector_number — is prefixed with its sector's name
// ("А-1", "Б-1"). That keeps two sectors from colliding if they happen to
// reuse the same box number, without needing a schema change. A single
// unnamed sector (the common case — most water bodies don't need named
// groups) keeps the plain, unprefixed label, unchanged from before v3.04.

import { parseSectorsConfig } from "./competitionSectors";

export function parseBoxLabels(json) {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const clean = arr.map((x) => String(x ?? "").trim());
    return clean.length > 0 ? clean : null;
  } catch {
    return null;
  }
}

export function stringifyBoxLabels(labels) {
  const clean = (labels || []).map((x) => String(x ?? "").trim());
  return clean.length > 0 ? JSON.stringify(clean) : "";
}

function effectiveLabel(sectorName, box) {
  return sectorName ? `${sectorName}-${box}` : box;
}

// Normalizes a SectorAvailability row into an array of raw
// { name, boxes: string[] } groups (boxes NOT yet prefixed — see
// labeledSectorGroupsFor for that), trying each format in order:
//   1. sectors_config (v3.04+, named groups)
//   2. box_labels (v2.96, one flat unnamed group)
//   3. sequential "1".."total_sectors" (pre-v2.96, one flat unnamed group)
// Never throws and never returns an empty array's worth of nothing useful —
// worst case is a single group with zero boxes.
export function sectorGroupsFor(avail) {
  const configured = parseSectorsConfig(avail?.sectors_config);
  if (configured.length > 0) return configured;

  const flat = parseBoxLabels(avail?.box_labels);
  if (flat && flat.length > 0) return [{ name: "", boxes: flat }];

  const count = Number(avail?.total_sectors) || 0;
  return [{ name: "", boxes: Array.from({ length: count }, (_, i) => String(i + 1)) }];
}

// Same groups, but each box already carries its EFFECTIVE (sector-prefixed
// when applicable) label — what the booking UI actually renders and what
// gets stored on SectorReservation.sector_number.
export function labeledSectorGroupsFor(avail) {
  return sectorGroupsFor(avail).map((g) => ({
    name: g.name,
    boxes: (g.boxes || []).map((b) => effectiveLabel(g.name, b)),
  }));
}

// Returns the flat, ordered list of every effective box label for a
// SectorAvailability row — used wherever a caller doesn't care about sector
// grouping (taken/free counting, validating a chosen label).
export function boxLabelsFor(avail) {
  return labeledSectorGroupsFor(avail).flatMap((g) => g.boxes);
}
