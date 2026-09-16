// src/lib/competitionSectors.js — v2.83
//
// "Sectors and boxes" for competitions: a competition can define one or more
// named sectors, each holding a fixed number of individually numbered boxes
// (e.g. sector "А" with 12 boxes = А-1..А-12). Stored as a single
// JSON-encoded string on Competition.sectors_config — this app's generic
// entity columns have no native JSON/array ColumnType (see
// server/schema/entities.generated.ts), so structured config goes into a
// TEXT column, the same pattern MenuGroup.menu_items already uses. Kept in
// one small shared module since both WaterBodyManagement.jsx (editing +
// drawing) and Competitions.jsx (read-only display) need the same
// parse/format logic.
//
// Terminology note: before v2.83, "сектор" (sector) meant a single numbered
// fishing spot — see SectorReservations.jsx / the SectorAvailability +
// SectorReservation entities, whose user-facing labels were renamed to
// "бокс" (box) in this same release. From v2.83 on, "sector" means a named
// GROUP of boxes, specific to competitions.

// Parses Competition.sectors_config into a clean array of
// { name: string, boxCount: number }, dropping anything malformed. Never
// throws — a bad/legacy value just reads as "no sectors configured".
export function parseSectorsConfig(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s === "object")
      .map((s) => ({ name: String(s.name ?? ""), boxCount: Math.max(0, Math.floor(Number(s.boxCount) || 0)) }))
      .filter((s) => s.name.trim() && s.boxCount > 0);
  } catch {
    return [];
  }
}

// Inverse of parseSectorsConfig — drops incomplete rows (blank name or
// zero/invalid box count) rather than erroring, so a half-filled row left
// in the editor just doesn't get saved. Returns "" (not "[]") when nothing
// valid is left, so sectors_config reads as unset/null-ish everywhere else.
export function stringifySectorsConfig(sectors) {
  const clean = (sectors || [])
    .map((s) => ({ name: String(s.name ?? "").trim(), boxCount: Math.max(0, Math.floor(Number(s.boxCount) || 0)) }))
    .filter((s) => s.name && s.boxCount > 0);
  return clean.length > 0 ? JSON.stringify(clean) : "";
}

export function totalBoxes(sectors) {
  return (sectors || []).reduce((sum, s) => sum + (Number(s.boxCount) || 0), 0);
}

// Builds the flat list of every individual box across all sectors, e.g.
// [{name:"А", boxCount:2}] -> [{sector:"А", box:1}, {sector:"А", box:2}].
export function allBoxes(sectors) {
  const out = [];
  (sectors || []).forEach((s) => {
    for (let i = 1; i <= s.boxCount; i++) out.push({ sector: s.name, box: i });
  });
  return out;
}

// Fisher–Yates, not just Array.sort(() => Math.random() - 0.5) — the sort
// trick is a well-known biased shuffle; this isn't.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const NOT_ENOUGH_BOXES = "NOT_ENOUGH_BOXES";

// Randomly assigns one box to each participant (main-slot registrations —
// callers pass whichever list they mean; reserves are intentionally left
// out by WaterBodyManagement.jsx since they aren't guaranteed a spot).
// Returns [{ id, sector, box }, ...], one entry per participant, in no
// particular order. Throws NOT_ENOUGH_BOXES if there are more participants
// than boxes — callers decide how to surface that.
export function drawBoxes(participants, sectors) {
  const boxes = allBoxes(sectors);
  if (boxes.length < participants.length) {
    throw new Error(NOT_ENOUGH_BOXES);
  }
  const shuffledBoxes = shuffle(boxes).slice(0, participants.length);
  return participants.map((p, i) => ({ id: p.id, sector: shuffledBoxes[i].sector, box: shuffledBoxes[i].box }));
}
