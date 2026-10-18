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
  try {
    const userId = currentUserId();
    const lang = currentLang();
    const emptyMap = readEmptyMap();
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
        water: needsWater(c) && !isSkipped("water", key, WATER_EMPTY_RETRY_MS),
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

    const results = new Map(); // grid key → { label?: string, water?: string }
    let requests = 0;
    let handled = 0;
    let offline = false;
    for (const [key, spot] of spots) {
      if (handled >= MAX_SPOTS_PER_RUN || offline) break;
      handled += 1;
      const found = {};
      if (spot.label) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const r = await lookupPlaceName(spot.coords.lat, spot.coords.lng, lang);
        if (r.status === "error") { offline = true; break; }
        if (r.status === "ok") found.label = r.name; else emptyMap[`label:${key}`] = now;
      }
      if (spot.water) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const r = await lookupNearbyWater(spot.coords.lat, spot.coords.lng, lang);
        // Overpass being down must not block the place names found above.
        if (r.status === "ok") found.water = r.name;
        else if (r.status === "empty") emptyMap[`water:${key}`] = now;
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
      if (found.water && needsWater(fresh)) patch.water_name = found.water;
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
    return updated;
  } catch (e) {
    console.error("resolvePendingLocationNames error:", e);
    return 0;
  }
}
