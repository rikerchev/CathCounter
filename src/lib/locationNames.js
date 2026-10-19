// v3.119 — replaces bare-coordinate catch locations with real place names once
// the connection is back.
// v3.120 — also fills in `water_name`: the lake/reservoir/river the catch was
// made at (OpenStreetMap/Overpass), which Statistics groups catches by.
//
// When a catch is logged with no internet, reverse geocoding (Nominatim)
// can't run, so geolocation.js stores the coordinates themselves as the
// location text ("43.123456, 26.123456"). That text means nothing to a person.
// This works exactly like the pending-photo upload: the catch keeps its
// coordinates until the app is online, then syncAll() calls
// resolvePendingLocationNames(), which looks up the name and stores it on the
// catch (marking the record unsynced so the very next pushPendingCatches()
// sends the corrected values to the server).
//
// v3.126 — `water_name` is only ever a STANDING water (язовир, езеро,
// рибарник, гьол …): that is what catches are grouped by. A river is never a
// group (Бели Лом is 200 km long, Дунав is the whole northern border); for a
// catch made at a river the location label becomes "река — населено място"
// instead, and the catch keeps no water_name. Catches that got a water_name
// from the earlier lookups (v3.120–v3.125, which also returned rivers) are
// re-checked once per spot: a river name is removed again.

import { getAllCatches, saveCatchLocal } from "@/lib/localDb";
import { lookupPlaceName, lookupNearbyWater } from "@/lib/geolocation";
import { catchCoords, isCoordinateLabel } from "@/lib/catchPlaces";

// Nominatim/Overpass fair-use: at most about 1 request/second.
const REQUEST_GAP_MS = 1100;
// Distinct spots handled per sync run — the rest is picked up by the next one.
const MAX_SPOTS_PER_RUN = 8;
// A spot the service had no answer for ("empty") isn't asked again for a
// while: a missing place name is retried after a day, a missing water body
// (a spot simply nowhere near a mapped water) after a week.
const LABEL_EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;
const WATER_EMPTY_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_KEY = "locationNameEmptyAt";
const LAST_USER_KEY = "catchcount_last_local_user_id";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// v3.123 — this runs in the BACKGROUND after a sync (see syncEngine.js); it
// must never be able to hold anything up or hammer the lookup services:
//  - one run at a time, at most one run every RUN_GAP_MS;
//  - a hard time budget per run;
//  - after a failed ("error") lookup, no further lookups for ERROR_BACKOFF_MS
//    (offline, rate-limited, or the service is down — retrying immediately
//    only makes it worse).
const RUN_GAP_MS = 2 * 60 * 1000;
const RUN_BUDGET_MS = 25 * 1000;
const ERROR_BACKOFF_MS = 15 * 60 * 1000;
const BACKOFF_KEY = "locationLookupBackoffUntil";
// v3.126 — spots whose water_name was (re)verified with the standing-water-only
// lookup, and the river (+ settlement) found at river spots.
const VERIFIED_KEY = "waterNameVerifiedV2";
const RIVER_KEY = "locationRiverCacheV2";
let running = false;
let lastRunAt = 0;

function inBackoff() {
  try { return Date.now() < Number(localStorage.getItem(BACKOFF_KEY) || 0); } catch { return false; }
}
function startBackoff() {
  try { localStorage.setItem(BACKOFF_KEY, String(Date.now() + ERROR_BACKOFF_MS)); } catch { /* ignore */ }
}

function readEmptyMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EMPTY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeEmptyMap(map) {
  try { localStorage.setItem(EMPTY_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
const normName = (v) => String(v || "").trim().toLocaleLowerCase();

// ~11 m grid: catches from the same swim share one lookup.
const gridKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function currentLang() {
  try { return localStorage.getItem("appLang") || "bg"; } catch { return "bg"; }
}
function currentUserId() {
  try { return localStorage.getItem(LAST_USER_KEY) || ""; } catch { return ""; }
}

const needsLabel = (c) => {
  const loc = typeof c.location === "string" ? c.location.trim() : "";
  return !loc || isCoordinateLabel(loc);
};
const needsWater = (c) => !(typeof c.water_name === "string" && c.water_name.trim());

/**
 * Looks up place/water names for the user's catches that lack them.
 * Returns how many catches were updated. Never throws.
 */
export async function resolvePendingLocationNames() {
  if (running || inBackoff() || Date.now() - lastRunAt < RUN_GAP_MS) return 0;
  running = true;
  lastRunAt = Date.now();
  const startedAt = Date.now();
  try {
    const userId = currentUserId();
    const lang = currentLang();
    const emptyMap = readEmptyMap();
    const verified = new Set(readJson(VERIFIED_KEY, []));
    const riverCache = readJson(RIVER_KEY, {});
    const now = Date.now();
    const isSkipped = (kind, key, retryMs) => {
      const at = emptyMap[`${kind}:${key}`];
      return !!at && now - at < retryMs;
    };

    const all = await getAllCatches();
    // Which lookups does a catch still need? (own catches with coordinates only)
    const wanted = (c) => {
      // Only the user's own catches (an admin's local store can also hold
      // other people's catches, which must not be edited from here).
      if (userId && c.created_by_id && c.created_by_id !== userId) return null;
      const coords = catchCoords(c);
      if (!coords) return null;
      const key = gridKey(coords.lat, coords.lng);
      return {
        coords,
        key,
        label: needsLabel(c) && !isSkipped("label", key, LABEL_EMPTY_RETRY_MS),
        // a catch with a name from the old lookups is checked once more
        water: (needsWater(c) || !verified.has(key)) && !isSkipped("water", key, WATER_EMPTY_RETRY_MS),
      };
    };

    const spots = new Map(); // grid key → { coords, label, water }
    for (const c of all) {
      const w = wanted(c);
      if (!w || (!w.label && !w.water)) continue;
      const s = spots.get(w.key) || { coords: w.coords, label: false, water: false };
      s.label = s.label || w.label;
      s.water = s.water || w.water;
      spots.set(w.key, s);
    }
    if (spots.size === 0) return 0;

    const results = new Map(); // grid key → { label?, water?: string|null, river?, place? }
    let requests = 0;
    let handled = 0;
    let offline = false;
    const labelHasName = (c, name) => normName(c.location).includes(normName(name));
    for (const [key, spot] of spots) {
      if (offline || Date.now() - startedAt > RUN_BUDGET_MS) break;
      const cachedRiver = spot.water ? riverCache[key] : null;
      // spots answered from the cache cost no request and don't use up the quota
      if (!cachedRiver && handled >= MAX_SPOTS_PER_RUN) break;
      if (!cachedRiver) handled += 1;
      const found = {};
      if (spot.label) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const r = await lookupPlaceName(spot.coords.lat, spot.coords.lng, lang);
        if (r.status === "error") { offline = true; startBackoff(); break; }
        if (r.status === "ok") { found.label = r.name; found.place = r.place || ""; } else emptyMap[`label:${key}`] = now;
      }
      if (spot.water) {
        if (cachedRiver) {
          found.water = null;
          found.river = cachedRiver.river;
          found.place = cachedRiver.place || "";
          found.placeReady = true;
        } else {
          if (requests++ > 0) await sleep(REQUEST_GAP_MS);
          const r = await lookupNearbyWater(spot.coords.lat, spot.coords.lng, lang);
          if (r.status === "ok" && r.kind === "river") {
            found.water = null; found.river = r.name; verified.add(key);
          } else if (r.status === "ok") {
            found.water = r.name; verified.add(key);
          } else if (r.status === "empty") {
            found.water = null; verified.add(key); emptyMap[`water:${key}`] = now;
          } else {
            // "error": Overpass is down — leave names as they are, ask again later
            startBackoff();
          }
        }
        // river spot: the settlement is needed for the "река — населено място" label
        if (found.river && !found.placeReady) {
          const needsLabelFix = all.some((c) => {
            const w = wanted(c);
            return w && w.key === key && !labelHasName(c, found.river);
          });
          if (needsLabelFix && !found.place) {
            if (requests++ > 0) await sleep(REQUEST_GAP_MS);
            const p = await lookupPlaceName(spot.coords.lat, spot.coords.lng, lang);
            if (p.status === "ok") found.place = p.place || "";
            if (p.status === "error") { found.river = undefined; startBackoff(); }
          }
          if (found.river) {
            found.placeReady = true;
            riverCache[key] = { river: found.river, place: found.place || "" };
          }
        }
      }
      results.set(key, found);
    }

    let updated = 0;
    // Re-read right before writing: the user may have edited a catch (or it
    // may have been synced) while the lookups above were running.
    for (const fresh of await getAllCatches()) {
      const w = wanted(fresh);
      if (!w) continue;
      const found = results.get(w.key);
      if (!found) continue;
      const patch = {};
      if (found.label && needsLabel(fresh)) patch.location = found.label;
      if (typeof found.water === "string" && found.water && fresh.water_name !== found.water) {
        patch.water_name = found.water;
      } else if (found.water === null && !needsWater(fresh)) {
        // not a standing water (a river, or nothing mapped): no water group
        patch.water_name = "";
      }
      // river fishing: "река — населено място" in the location label (not a group)
      if (found.river && found.placeReady) {
        const current = patch.location ?? fresh.location;
        if (!labelHasName({ location: current }, found.river)) {
          patch.location = found.place ? `${found.river} — ${found.place}` : found.river;
        }
      }
      if (Object.keys(patch).length === 0) continue;
      await saveCatchLocal({
        ...fresh,
        ...patch,
        // keep the exact coordinates for the record when only the label had them
        latitude: fresh.latitude ?? w.coords.lat,
        longitude: fresh.longitude ?? w.coords.lng,
        _synced: false,
      });
      updated += 1;
    }

    writeEmptyMap(emptyMap);
    writeJson(VERIFIED_KEY, [...verified]);
    writeJson(RIVER_KEY, riverCache);
    return updated;
  } catch (e) {
    console.error("resolvePendingLocationNames error:", e);
    return 0;
  } finally {
    running = false;
  }
}
