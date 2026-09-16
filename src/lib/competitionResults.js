// src/lib/competitionResults.js — v2.87
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

// Standings, descending by total weight — heaviest total catch first,
// lightest last, exactly as requested. Only registrations with at least one
// round's weight entered are ranked; everyone else hasn't been weighed in
// yet and doesn't belong on a leaderboard. `rank` is 1-based. Ties keep
// their relative registration order (stable sort) — this app doesn't track
// a tiebreaker (e.g. biggest single fish), so exact ties are left as-is
// rather than guessing an order.
export function rankByTotalWeight(registrations) {
  return (registrations || [])
    .map((r) => {
      const results = parseCatchResults(r.catch_results);
      return { ...r, results, total: totalCatchWeight(results) };
    })
    .filter((r) => hasAnyResult(r.results))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
