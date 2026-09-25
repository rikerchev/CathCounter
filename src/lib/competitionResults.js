// src/lib/competitionResults.js — v2.87, extended v2.89
//
// Multi-round ("манш") catch-weight results for a competition. A competition
// now declares how many rounds it has (Competition.rounds_count); each
// registration stores its own per-round weights as a JSON-encoded array on
// CompetitionRegistration.catch_results, e.g. "[12.5,null,8.3]" for a
// 3-round competition whose round 2 hasn't been weighed in yet. Same
// "structured data in a TEXT column" pattern as sectors_config (see
// src/lib/competitionSectors.js) — this app's generic entity columns have no
// native JSON/array ColumnType (see server/schema/entities.generated.ts).
//
// Editing catch_results goes through the SAME CompetitionRegistration.update
// call (and therefore the SAME authorization rule) already used for
// name/phone/slot/payment edits — see entities.generated.ts:
// owner_or_relation(created_by_id, competition_id -> competitions). That
// rule already grants exactly the three groups this feature was asked to
// support: the user who registered that participant, the competition's
// organizer, and admins (global bypass) — so no new access-rule plumbing
// was needed here.
//
// v2.89 — added sector "zone points" (наказателни точки) and
// rankByPenaltyAndWeight, the app's real standings ranking from here on:
// penalty points first (fewer is better), total weight only as the
// tie-break. Everything needed to compute this (assigned_sector/
// assigned_box from src/lib/competitionSectors.js's drawBoxes, plus
// catch_results already covered above) already existed — no new stored
// field, this is pure derived data computed fresh every render.

// Parses Competition.sectors_config-style JSON into an array of numbers/
// nulls. Never throws — a bad/legacy value just reads as "no rounds weighed
// in yet". A null entry means that round hasn't been recorded, and is kept
// distinct from a 0 kg (real, recorded) catch.
export function parseCatchResults(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((w) => (typeof w === "number" && !Number.isNaN(w) ? w : null));
  } catch {
    return [];
  }
}

// `values` is an array of raw form-input strings, one per round ("" = not
// weighed in yet). Blank/invalid entries become null, not 0 — a round with
// no result yet must never silently count as a zero-weight catch.
export function stringifyCatchResults(values) {
  const clean = (values || []).map((v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  });
  return JSON.stringify(clean);
}

export function totalCatchWeight(results) {
  return (results || []).reduce((sum, w) => sum + (typeof w === "number" ? w : 0), 0);
}

export function hasAnyResult(results) {
  return (results || []).some((w) => typeof w === "number");
}

// v3.69 — a registration's catch is now split into two separately-tracked
// per-round categories, both JSON-encoded arrays with the exact same shape
// as catch_results always had: catch_results itself ("Улов" — the keep-net
// catch, weighed at the end) and the new catch_results_scale ("Кантарни
// риби" — fish weighed on the scale immediately after the catch and
// released right away, never held in the keep-net). Requested so the
// xlsx export/import (src/lib/competitionExcel.js) can show and accept
// both numbers separately, with their sum ("Общ улов") feeding the exact
// same scoring this module already had — nothing about the ranking RULES
// changed, only what a single round's "weight" is built from.
//
// Returns one combined per-round weight array, same shape/semantics as
// parseCatchResults's own return value (null = nothing recorded for that
// round in EITHER category; a number = the sum of whichever of the two
// categories has something recorded for that round, missing side treated
// as 0). Every ranking/points function below reads through this instead of
// parseCatchResults(reg.catch_results) directly, so a round only counted
// via one category before now counts the same when split into two.
export function combinedResults(reg) {
  const keep = parseCatchResults(reg?.catch_results);
  const scale = parseCatchResults(reg?.catch_results_scale);
  const len = Math.max(keep.length, scale.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const k = keep[i];
    const s = scale[i];
    out.push(k == null && s == null ? null : (k || 0) + (s || 0));
  }
  return out;
}

// Standings, descending by total weight — heaviest total catch first,
// lightest last. Superseded as the STANDINGS ranking by
// rankByPenaltyAndWeight below (v2.89 — sector penalty points became the
// primary criterion, weight only the tie-break), kept here since it's still
// a simple, useful "total weight only" ranking on its own. `rank` is
// 1-based. Ties keep their relative registration order (stable sort).
export function rankByTotalWeight(registrations) {
  return (registrations || [])
    .map((r) => {
      const results = combinedResults(r); // v3.69 — кантарни риби + улов combined, see above
      return { ...r, results, total: totalCatchWeight(results) };
    })
    .filter((r) => hasAnyResult(r.results))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// v2.89 — sector "zone points" (наказателни точки / penalty points), the
// classic match-fishing scoring system: for one round, every participant is
// ranked AGAINST THE OTHERS IN THEIR OWN SECTOR ONLY, by that round's catch
// weight. The heaviest catch in the sector scores 1 point (best); the
// lightest scores N points, where N is how many of that sector's
// competitors actually have a recorded weight for this round — which
// equals the sector's full box count once everyone in it has weighed in
// (exactly "сектор със 7 бокса → последният получава 7 точки"), and is
// simply lower than that while some of the sector's boxes haven't reported
// yet for this round (self-corrects as more weights are entered — nothing
// here waits for the whole sector to be complete first). Two competitors
// with the exact same weight split the average of their tied rank
// positions (the standard tie convention in this scoring system) instead of
// an arbitrary order.
//
// A registration with no assigned sector/box yet (жребий not drawn), or
// with no recorded weight for THIS round, simply isn't in the returned map
// for this round — it contributes nothing to that round's points (not a
// bad instant last place) and is picked up automatically once it does have
// a weight.
//
// Returns Map<registrationId, points> for this one round.
export function roundSectorPoints(registrations, roundIndex) {
  const bySector = new Map();
  for (const r of registrations || []) {
    if (!r.assigned_sector || r.assigned_box == null) continue;
    const w = combinedResults(r)[roundIndex]; // v3.69 — кантарни риби + улов combined, see above
    if (typeof w !== "number") continue;
    if (!bySector.has(r.assigned_sector)) bySector.set(r.assigned_sector, []);
    bySector.get(r.assigned_sector).push({ id: r.id, weight: w });
  }
  const points = new Map();
  for (const entries of bySector.values()) {
    entries.sort((a, b) => b.weight - a.weight); // heaviest first = rank 1
    let i = 0;
    while (i < entries.length) {
      let j = i;
      while (j + 1 < entries.length && entries[j + 1].weight === entries[i].weight) j++;
      const avgRank = (i + 1 + (j + 1)) / 2; // 1-based positions i+1..j+1, averaged
      for (let k = i; k <= j; k++) points.set(entries[k].id, avgRank);
      i = j + 1;
    }
  }
  return points;
}

// Sums roundSectorPoints across every round of the competition. A
// registration only contributes for the rounds it actually has a weight
// recorded for — a round nobody's weighed in for yet adds nothing to
// anyone's total (it isn't treated as a free pass or a penalty).
export function totalPenaltyPoints(registrations, roundsCount) {
  const totals = new Map();
  for (let i = 0; i < Math.max(1, roundsCount || 1); i++) {
    for (const [id, pts] of roundSectorPoints(registrations, i)) {
      totals.set(id, (totals.get(id) || 0) + pts);
    }
  }
  return totals;
}

// Final standings, as requested: FEWER total penalty points is better (rank
// 1 = lowest total); total catch weight (heaviest first) is the SECOND,
// tie-break criterion only. Only registrations that were actually scored in
// at least one round (assigned a box AND weighed in at least once) are
// ranked — same "hasn't fished yet, not on the leaderboard" rule as
// rankByTotalWeight, just driven by the penalty map instead of a plain
// hasAnyResult check. `rank` is 1-based.
export function rankByPenaltyAndWeight(registrations, roundsCount) {
  const penaltyMap = totalPenaltyPoints(registrations, roundsCount);
  return (registrations || [])
    .filter((r) => penaltyMap.has(r.id))
    .map((r) => {
      const results = combinedResults(r); // v3.69 — кантарни риби + улов combined, see above
      return { ...r, results, total: totalCatchWeight(results), penalty: penaltyMap.get(r.id) };
    })
    .sort((a, b) => (a.penalty !== b.penalty ? a.penalty - b.penalty : b.total - a.total))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
