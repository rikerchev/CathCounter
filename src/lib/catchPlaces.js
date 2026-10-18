// v3.119 — turns the raw `location` strings of catches (what Nominatim
// returned at the time, or bare coordinates when the catch was logged
// offline) into PLACES a person can recognise, and groups them by water body.
//
// Why: the location filter in Statistics used to list every distinct raw
// string — "Виадукт Писанец — Писанец", "Писанец — Ветово", "43.123456,
// 26.123456" — so one real fishing place showed up as many unrelated entries,
// some of them meaningless numbers.
//
// A catch is assigned to a place like this:
//   1. it has coordinates (latitude/longitude, or parsed from a coordinate-
//      only label) and an approved water body lies within WATER_BODY_RADIUS_M
//      → the place is that water body (its own name);
//   2. otherwise it has coordinates → nearby catches (single-linkage, within
//      CLUSTER_RADIUS_M) form one place, named after the most frequent word-
//      group in their labels ("Виадукт Писанец" + "Писанец" + "Писанец —
//      Ветово" → "Писанец");
//   3. otherwise (no coordinates) a label that mentions an already known
//      place joins it, else the label is a place of its own;
//   4. no coordinates and no label → no place (only shows under "all").
//
// Every place has "spots" — the distinct original labels inside it — so the
// picker can show "Писанец ▸ Виадукт Писанец / Ветово" as expandable
// sub-locations. Raw coordinates are NEVER used as a displayed name: an
// unresolved spot is shown as `unnamedSpot` (supplied by the caller, i18n).

import { distanceMeters } from "@/lib/geolocation";

export const WATER_BODY_RADIUS_M = 1500;
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

function nearestWaterBody(coords, waterBodies) {
  let best = null;
  let bestDist = Infinity;
  for (const wb of waterBodies) {
    const d = distanceMeters(coords.lat, coords.lng, wb.lat, wb.lng);
    if (d < bestDist) { bestDist = d; best = wb; }
  }
  return best && bestDist <= WATER_BODY_RADIUS_M ? best : null;
}

// The most frequent " — "-separated word group over a set of labels. Ties go
// to the one seen first. Returns "" when there are no labels.
function dominantSegment(labels) {
  const counts = new Map();
  for (const label of labels) {
    for (const seg of new Set(segmentsOf(label))) {
      const k = norm(seg);
      const cur = counts.get(k);
      if (cur) cur.n += 1; else counts.set(k, { n: 1, text: seg });
    }
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

  // --- 1. coordinates + water body ---------------------------------------
  const withCoords = [];
  const withoutCoords = [];
  for (const c of catches) {
    const coords = catchCoords(c);
    if (!coords) { withoutCoords.push(c); continue; }
    const wb = nearestWaterBody(coords, wbs);
    if (wb) addToPlace(c, `wb:${wb.id}`, wb.name);
    else withCoords.push({ c, coords });
  }

  // --- 2. remaining coordinates → proximity clusters (single linkage) ------
  const parent = withCoords.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < withCoords.length; i++) {
    for (let j = i + 1; j < withCoords.length; j++) {
      const a = withCoords[i].coords, b = withCoords[j].coords;
      if (distanceMeters(a.lat, a.lng, b.lat, b.lng) <= CLUSTER_RADIUS_M) {
        parent[find(i)] = find(j);
      }
    }
  }
  const clusters = new Map();
  withCoords.forEach((item, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(item);
  });
  const usedNames = new Map(); // normalized name → how many places already use it
  let unnamedCounter = 0;
  for (const items of clusters.values()) {
    const name = dominantSegment(items.map((x) => catchLabel(x.c)).filter(Boolean));
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
    const hit = segs.map((s) => knownByName.get(norm(s))).find(Boolean);
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

  return { places, placeKeyOf, labelFor, matches };
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
