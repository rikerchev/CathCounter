// v3.119 — turns the raw `location` strings of catches (what Nominatim
// returned at the time, or bare coordinates when the catch was logged
// offline) into PLACES a person can recognise, and groups them by water body.
//
// Why: the location filter in Statistics used to list every distinct raw
// string — "Виадукт Писанец — Писанец", "Писанец — Ветово", "43.123456,
// 26.123456" — so one real fishing place showed up as many unrelated entries,
// some of them meaningless numbers.
//
// A catch is assigned to a place like this (v3.120 — grouping is around the
// NAME OF THE WATER BODY, never the nearest settlement: a big state-owned
// reservoir touches many villages, but the fishing happened at the reservoir):
//   1. the catch carries `water_name` = its GROUP (v3.127: a named standing
//      water — язовир, езеро, рибарник, гьол — if one is mapped near the spot,
//      else the nearest settlement; rivers are never groups); looked up from OpenStreetMap by
//      locationNames.js once online — works for ANY mapped water body,
//      registered/approved in the app or not) → the place is that water;
//   2. no water_name but coordinates: an unresolved catch within
//      SAME_WATER_RADIUS_M of a catch that has one joins it; else an approved
//      app water body within WATER_BODY_RADIUS_M; else nearby catches
//      (single-linkage, CLUSTER_RADIUS_M) form one place named after the most
//      frequent label (v3.126: whole label, e.g. "река — село", and bounded
//      clusters — a river is never a group);
//   3. no coordinates: a label that mentions an already known place joins it,
//      else the label is a place of its own;
//   4. no coordinates and no label → no place (only shows under "all").
// Water names are compared without type words/quotes ("Язовир „Ветово"",
// "яз. Ветово" and "Ветово" are the same place), and an approved app water
// body with the same name donates its official spelling.
//
// Every place has "spots" — the distinct original labels inside it — so the
// picker can show "Ветово ▸ Виадукт Писанец / Писанец" as expandable
// sub-locations. Raw coordinates are NEVER used as a displayed name: an
// unresolved spot is shown as `unnamedSpot` (supplied by the caller, i18n).

import { distanceMeters } from "@/lib/geolocation";

export const WATER_BODY_RADIUS_M = 1500;
export const SAME_WATER_RADIUS_M = 300;
export const CLUSTER_RADIUS_M = 1000;

const COORD_LABEL_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** True when a location string is just "lat, lng" (written while offline). */
export function isCoordinateLabel(value) {
  return typeof value === "string" && COORD_LABEL_RE.test(value);
}

function parseCoordinateLabel(value) {
  const m = typeof value === "string" ? value.match(COORD_LABEL_RE) : null;
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return isValidCoord(lat, lng) ? { lat, lng } : null;
}

function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Coordinates of a catch: its own fields first, else a coordinate label. */
export function catchCoords(c) {
  const lat = typeof c.latitude === "number" ? c.latitude : parseFloat(c.latitude);
  const lng = typeof c.longitude === "number" ? c.longitude : parseFloat(c.longitude);
  if (isValidCoord(lat, lng)) return { lat, lng };
  return parseCoordinateLabel(c.location);
}

/** The human-readable label of a catch, or "" if it only has coordinates. */
export function catchLabel(c) {
  const loc = typeof c.location === "string" ? c.location.trim() : "";
  return loc && !isCoordinateLabel(loc) ? loc : "";
}

const norm = (s) => String(s || "").trim().toLocaleLowerCase();
const segmentsOf = (label) =>
  String(label).split("—").map((s) => s.trim()).filter(Boolean);

const WATER_TYPE_WORDS = new Set([
  "язовир", "яз", "яз.", "микроязовир", "езеро", "река", "р.", "канал", "бент", "водоем", "дига", "залив",
  "lake", "reservoir", "river", "dam", "canal", "pond", "lac", "see", "lago", "jezero", "tó", "озеро", "водохранилище",
]);

/** Comparable form of a water name: no quotes, no type words, lower case. */
export function normalizeWaterName(name) {
  const cleaned = String(name || "")
    .replace(/[„“”"«»'`‘’()]/g, " ")
    .replace(/[,;:]/g, " ")
    .trim()
    .toLocaleLowerCase();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !WATER_TYPE_WORDS.has(w));
  return (kept.length ? kept : words).join(" ");
}

function nearestWaterBody(coords, waterBodies) {
  let best = null;
  let bestDist = Infinity;
  for (const wb of waterBodies) {
    const d = distanceMeters(coords.lat, coords.lng, wb.lat, wb.lng);
    if (d < bestDist) { bestDist = d; best = wb; }
  }
  return best && bestDist <= WATER_BODY_RADIUS_M ? best : null;
}

// v3.126 — the most frequent whole label (ties: the first seen).
function dominantLabel(labels) {
  const counts = new Map();
  for (const label of labels) {
    const k = norm(label);
    const cur = counts.get(k);
    if (cur) cur.n += 1; else counts.set(k, { n: 1, text: label });
  }
  let best = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best ? best.text : "";
}

/**
 * @param catches      array of catch records
 * @param waterBodies  [{ id, name, lat, lng }] (approved ones with coordinates)
 * @param unnamed      { place: string, spot: string } fallback display names
 * @returns {{
 *   places: Array<{ key, name, count, spots: Array<{ key, name, count }> }>,
 *   placeKeyOf: (c) => string,
 *   matches: (c, filterValue) => boolean,
 *   labelFor: (c) => string,
 * }}
 */
export function buildPlaceIndex(catches, waterBodies = [], unnamed = {}) {
  const unnamedPlace = unnamed.place || "—";
  const unnamedSpot = unnamed.spot || "—";
  const wbs = (waterBodies || []).filter((w) => isValidCoord(w.lat, w.lng));

  // catch id → { placeKey, spotKey }
  const assignment = new Map();
  const placeInfo = new Map(); // placeKey → { name, spots: Map(spotKey → {name,count}), count }

  const ensurePlace = (key, name) => {
    let p = placeInfo.get(key);
    if (!p) { p = { key, name, count: 0, spots: new Map() }; placeInfo.set(key, p); }
    return p;
  };
  const addToPlace = (c, placeKey, placeName) => {
    const label = catchLabel(c);
    const spotKey = label || "";
    const p = ensurePlace(placeKey, placeName);
    p.count += 1;
    const s = p.spots.get(spotKey);
    if (s) s.count += 1; else p.spots.set(spotKey, { key: spotKey, name: label || unnamedSpot, count: 1 });
    assignment.set(c, { placeKey, spotKey });
  };

  // --- 1. the water body's own name -------------------------------------
  // Official spellings from approved app water bodies.
  const officialByNorm = new Map();
  for (const wb of wbs) officialByNorm.set(normalizeWaterName(wb.name), wb.name);

  // Water groups: normalized name → { names: Map(name → n), items: [catch] }
  const waterGroups = new Map();
  const resolvedSpots = new Map(); // ~110 m grid → water key (for step 2)
  const withCoords = [];
  const withoutCoords = [];
  const unresolved = [];
  for (const c of catches) {
    const wn = typeof c.water_name === "string" ? c.water_name.trim() : "";
    const coords = catchCoords(c);
    if (wn) {
      const nk = normalizeWaterName(wn);
      let g = waterGroups.get(nk);
      if (!g) { g = { names: new Map(), items: [] }; waterGroups.set(nk, g); }
      g.names.set(wn, (g.names.get(wn) || 0) + 1);
      g.items.push(c);
      if (coords) resolvedSpots.set(`${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`, { nk, coords });
    } else if (coords) {
      unresolved.push({ c, coords });
    } else {
      withoutCoords.push(c);
    }
  }
  const waterKey = (nk) => `w:${nk}`;
  const displayOfWater = (nk) => {
    if (officialByNorm.has(nk)) return officialByNorm.get(nk);
    const g = waterGroups.get(nk);
    let best = ""; let bestN = -1;
    for (const [name, n] of g.names) if (n > bestN) { best = name; bestN = n; }
    return best;
  };
  for (const [nk, g] of waterGroups) {
    for (const c of g.items) addToPlace(c, waterKey(nk), displayOfWater(nk));
  }

  // --- 1b. coordinates only: join a nearby already-named water, else an
  //         approved app water body, else fall through to clustering -------
  const resolvedList = [...resolvedSpots.values()];
  for (const item of unresolved) {
    const { c, coords } = item;
    let joined = null; let bestD = SAME_WATER_RADIUS_M;
    for (const r of resolvedList) {
      const d = distanceMeters(coords.lat, coords.lng, r.coords.lat, r.coords.lng);
      if (d <= bestD) { bestD = d; joined = r.nk; }
    }
    if (joined) { addToPlace(c, waterKey(joined), displayOfWater(joined)); continue; }
    const wb = nearestWaterBody(coords, wbs);
    if (wb) {
      const nk = normalizeWaterName(wb.name);
      addToPlace(c, waterKey(nk), waterGroups.has(nk) ? displayOfWater(nk) : wb.name);
      continue;
    }
    withCoords.push(item);
  }

  // --- 2. remaining coordinates → proximity clusters ------------------------
  // v3.126 — these are the catches with no standing water around them (typically
  // river fishing). They must NOT chain into one long strip along a river, so
  // clusters are "leader" clusters: a catch joins the first cluster whose first
  // catch is within CLUSTER_RADIUS_M, else it starts a new one (diameter stays
  // bounded). A cluster is named after its most frequent FULL label, e.g.
  // "Бели лом — Дряново" (river + settlement), never after the river alone.
  const leaders = [];
  for (const item of withCoords) {
    let home = null;
    for (const cl of leaders) {
      const a = cl.items[0].coords;
      if (distanceMeters(a.lat, a.lng, item.coords.lat, item.coords.lng) <= CLUSTER_RADIUS_M) { home = cl; break; }
    }
    if (home) home.items.push(item); else leaders.push({ items: [item] });
  }
  const usedNames = new Map(); // normalized name → how many places already use it
  let unnamedCounter = 0;
  for (const { items } of leaders) {
    const name = dominantLabel(items.map((x) => catchLabel(x.c)).filter(Boolean));
    let displayName = name;
    if (!displayName) {
      unnamedCounter += 1;
      displayName = unnamedCounter === 1 ? unnamedPlace : `${unnamedPlace} ${unnamedCounter}`;
    }
    const nk = norm(displayName);
    const seen = usedNames.get(nk) || 0;
    usedNames.set(nk, seen + 1);
    const key = `c:${nk}${seen ? `#${seen}` : ""}`;
    for (const x of items) addToPlace(x.c, key, displayName);
  }

  // --- 3/4. no coordinates ----------------------------------------------
  const knownByName = new Map(); // normalized place name → placeKey
  for (const p of placeInfo.values()) knownByName.set(norm(p.name), p.key);
  for (const c of withoutCoords) {
    const label = catchLabel(c);
    if (!label) { assignment.set(c, { placeKey: "", spotKey: "" }); continue; }
    const segs = segmentsOf(label);
    const hit = segs
      .map((s) => {
        const wk = waterKey(normalizeWaterName(s));
        return placeInfo.has(wk) ? wk : knownByName.get(norm(s));
      })
      .find(Boolean);
    if (hit) { addToPlace(c, hit, placeInfo.get(hit).name); continue; }
    addToPlace(c, `l:${norm(label)}`, label);
  }

  const places = [...placeInfo.values()]
    .map((p) => ({
      key: p.key,
      name: p.name,
      count: p.count,
      spots: [...p.spots.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const placeKeyOf = (c) => assignment.get(c)?.placeKey || "";
  const spotKeyOf = (c) => assignment.get(c)?.spotKey || "";
  const labelFor = (c) => {
    const a = assignment.get(c);
    return a && a.placeKey ? placeInfo.get(a.placeKey).name : "";
  };

  // filter value: "" (all) | "p:<placeKey>" | "s:<placeKey>::<spotKey>"
  const matches = (c, filterValue) => {
    if (!filterValue) return true;
    const a = assignment.get(c);
    if (!a || !a.placeKey) return false;
    if (filterValue.startsWith("p:")) return a.placeKey === filterValue.slice(2);
    if (filterValue.startsWith("s:")) {
      const rest = filterValue.slice(2);
      const idx = rest.indexOf("::");
      return a.placeKey === rest.slice(0, idx) && a.spotKey === rest.slice(idx + 2);
    }
    return false;
  };

  return { places, placeKeyOf, spotKeyOf, labelFor, matches };
}

export const placeFilterValue = (placeKey) => `p:${placeKey}`;
export const spotFilterValue = (placeKey, spotKey) => `s:${placeKey}::${spotKey}`;

/** Display text for the current filter value (used on the trigger button). */
export function describeFilter(index, filterValue) {
  if (!filterValue) return "";
  if (filterValue.startsWith("p:")) {
    return index.places.find((p) => p.key === filterValue.slice(2))?.name || "";
  }
  if (filterValue.startsWith("s:")) {
    const rest = filterValue.slice(2);
    const idx = rest.indexOf("::");
    const place = index.places.find((p) => p.key === rest.slice(0, idx));
    const spot = place?.spots.find((s) => s.key === rest.slice(idx + 2));
    return place && spot ? `${place.name} ▸ ${spot.name}` : "";
  }
  return "";
}
