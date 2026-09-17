// src/lib/sectorLabels.js — v2.96
//
// Custom box/sector labels for the GENERAL (non-competition) reservation
// system — SectorAvailability / SectorReservation, used by
// WaterBodyManagement.jsx's sector declaration form and SectorReservations.jsx.
// Before v2.96 this system only had a plain box COUNT (total_sectors) and
// boxes were always auto-numbered "1".."total_sectors" — no way for the
// water body owner to give a box its own name/number, unlike the
// competition system's sectors_config (see competitionSectors.js), which
// has supported individually-named boxes since v2.84.
//
// box_labels on SectorAvailability is a single JSON-encoded array of
// strings, one per box, in order (e.g. '["1","2","VIP-1"]'). Kept flat (no
// named sector GROUPS like competitions have) since the general reservation
// system has never had that grouping concept — just a single availability
// with N boxes. Never throws — a bad/legacy/empty value just means "no
// custom labels", and boxLabelsFor() falls back to sequential numbering so
// every existing water body keeps working exactly as before.

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

// Returns the effective ordered list of box labels for a SectorAvailability
// row: its own custom box_labels when set, otherwise sequential "1".."N"
// (N = total_sectors), so callers never need to branch on whether custom
// labels exist.
export function boxLabelsFor(avail) {
  const custom = parseBoxLabels(avail?.box_labels);
  if (custom && custom.length > 0) return custom;
  const count = Number(avail?.total_sectors) || 0;
  return Array.from({ length: count }, (_, i) => String(i + 1));
}
