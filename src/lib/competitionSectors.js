// src/lib/competitionSectors.js — v2.83, revised v2.84
//
// "Sectors and boxes" for competitions: a competition can define one or more
// named sectors, each holding a list of INDIVIDUALLY named/numbered boxes
// (e.g. sector "А" with boxes ["1","2","3"], or arbitrary labels like
// ["VIP-1","VIP-2"] — not necessarily sequential integers). Stored as a
// single JSON-encoded string on Competition.sectors_config — this app's
// generic entity columns have no native JSON/array ColumnType (see
// server/schema/entities.generated.ts), so structured config goes into a
// TEXT column, the same pattern MenuGroup.menu_items already uses. Kept in
// one small shared module since both WaterBodyManagement.jsx (editing +
// drawing) and Competitions.jsx (read-only display) need the same
// parse/format logic.
//
// Terminology note: before v2.83, "сектор" (sector) meant a single numbered
// fishing spot — see SectorReservations.jsx / the SectorAvailability +
// SectorReservation entities, whose user-facing labels were renamed to
// "бокс" (box) in that same release. From v2.83 on, "sector" means a named
// GROUP of boxes, specific to competitions.
//
// v2.84 — originally a sector just had a boxCount and boxes were numbered
// 1..boxCount automatically. Changed so the organizer can give EACH box its
// own individual name/number (e.g. skip a number, or use non-numeric
// labels): sectors_config now stores each sector's actual box labels
// (sectors_config: '[{"name":"А","boxes":["1","2","3"]}]'), not just a
// count. The editor (WaterBodyManagement.jsx) still has a "box count" field
// that drives how many label cells appear, for convenience, but the count
// itself is never persisted — only the resulting labels are.

// Parses Competition.sectors_config into a clean array of
// { name: string, boxes: string[] }, dropping anything malformed. Never
// throws — a bad/legacy value just reads as "no sectors configured". A
// pre-v2.84 value (boxCount instead of boxes) also reads as empty, since
// there are no real box labels to recover from it — the organizer re-enters
// them once, same as any other blank sectors_config.
export function parseSectorsConfig(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        name: String(s.name ?? ""),
        boxes: Array.isArray(s.boxes) ? s.boxes.map((b) => String(b ?? "")) : [],
      }))
      .filter((s) => s.name.trim() && s.boxes.length > 0);
  } catch {
    return [];
  }
}

// Inverse of parseSectorsConfig — drops sectors with a blank name or no
// boxes at all. A blank individual box label falls back to its 1-based
// position in the sector ("1", "2", ...) so the draw always has something
// unique to assign, even if the organizer left a cell empty. Returns ""
// (not "[]") when nothing valid is left, so sectors_config reads as
// unset/null-ish everywhere else.
export function stringifySectorsConfig(sectors) {
  const clean = (sectors || [])
    .map((s) => ({
      name: String(s.name ?? "").trim(),
      boxes: (s.boxes || []).map((b, i) => String(b ?? "").trim() || String(i + 1)),
    }))
    .filter((s) => s.name && s.boxes.length > 0);
  return clean.length > 0 ? JSON.stringify(clean) : "";
}

export function totalBoxes(sectors) {
  return (sectors || []).reduce((sum, s) => sum + (s.boxes ? s.boxes.length : 0), 0);
}

// Builds the flat list of every individual box across all sectors, e.g.
// [{name:"А", boxes:["1","2"]}] -> [{sector:"А", box:"1"}, {sector:"А", box:"2"}].
export function allBoxes(sectors) {
  const out = [];
  (sectors || []).forEach((s) => {
    (s.boxes || []).forEach((label) => out.push({ sector: s.name, box: label }));
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
// particular order — `box` is whatever label the organizer gave that box,
// not necessarily a number. Throws NOT_ENOUGH_BOXES if there are more
// participants than boxes — callers decide how to surface that.
export function drawBoxes(participants, sectors) {
  const boxes = allBoxes(sectors);
  if (boxes.length < participants.length) {
    throw new Error(NOT_ENOUGH_BOXES);
  }
  const shuffledBoxes = shuffle(boxes).slice(0, participants.length);
  return participants.map((p, i) => ({ id: p.id, sector: shuffledBoxes[i].sector, box: shuffledBoxes[i].box }));
}
