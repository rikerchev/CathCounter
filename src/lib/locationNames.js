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
// v3.126/v3.127 — what a catch is GROUPED BY is stored in `water_name` (the
// column predates the settlement rule, so it keeps its name):
//   1. a named STANDING water (язовир, езеро, рибарник, гьол …) on the map
//      near the spot → its name;
//   2. otherwise (no mapped water, or the spot is by a river) → the NEAREST
//      SETTLEMENT (city/town/village). A river is never a group (Бели Лом is
//      200 km long, Дунав is the whole northern border); for river fishing the
//      location label additionally becomes "река — населено място".
// One Overpass answer per ~11 m spot is kept in localStorage (SPOT_KEY), so a
// spot is looked up once, ever; catches from the earlier versions are brought
// in line with it from that answer (no further requests).

import { getAllCatches, saveCatchLocal } from "@/lib/localDb";
import { lookupPlaceName, lookupNearbyWater } from "@/lib/geolocation";
import { catchCoords, isCoordinateLabel, rememberRiverName } from "@/lib/catchPlaces";

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
const RUN_GAP_MS = 60 * 1000;
const RUN_BUDGET_MS = 25 * 1000;
const ERROR_BACKOFF_MS = 5 * 60 * 1000;
const BACKOFF_KEY = "locationLookupBackoffUntil";
// v3.127 — per-spot answer: grid key → { water, river, settlement }
// v3.131 — V4: the "standing water" test got stricter (a river drawn as an
// area named like the river is no longer a water body), so V3 answers that
// named a standing water are asked again; the rest is carried over.
const SPOT_KEY = "locationSpotCacheV4";
const OLD_SPOT_KEY = "locationSpotCacheV3";
// v3.132 — once per app generation the pause after earlier failures and the
// "nothing mapped here" memory are forgotten: the lookup query changed (smaller
// answer, longer timeout), so what failed or came back empty before is asked
// again right away instead of waiting 15 minutes / a week.
const GENERATION = "3.132";
const GENERATION_KEY = "locationLookupGeneration";
function resetLookupStateOnce() {
  try {
    if (localStorage.getItem(GENERATION_KEY) === GENERATION) return;
    localStorage.removeItem(BACKOFF_KEY);
    const empty = readEmptyMap();
    for (const k of Object.keys(empty)) if (k.startsWith("water:")) delete empty[k];
    writeEmptyMap(empty);
    localStorage.setItem(GENERATION_KEY, GENERATION);
  } catch { /* ignore */ }
}
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

/**
 * Looks up place/water names for the user's catches that lack them.
 * Returns how many catches were updated. Never throws.
 */
export async function resolvePendingLocationNames() {
  resetLookupStateOnce();
  if (running || inBackoff() || Date.now() - lastRunAt < RUN_GAP_MS) return 0;
  running = true;
  lastRunAt = Date.now();
  const startedAt = Date.now();
  try {
    const userId = currentUserId();
    const lang = currentLang();
    const emptyMap = readEmptyMap();
    let spotCache = readJson(SPOT_KEY, null);
    if (!spotCache) {
      spotCache = {};
      const oldCache = readJson(OLD_SPOT_KEY, {});
      for (const [k, v] of Object.entries(oldCache)) {
        if (v && !v.water) spotCache[k] = v; // no standing water → answer unchanged
      }
      writeJson(SPOT_KEY, spotCache);
    }
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
        // the spot's water/river/settlement is asked once, then cached
        water: !spotCache[key] && !isSkipped("water", key, WATER_EMPTY_RETRY_MS),
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

    const labels = new Map(); // grid key → place label from Nominatim
    let requests = 0;
    let handled = 0;
    let offline = false;
    for (const [key, spot] of spots) {
      if (offline || handled >= MAX_SPOTS_PER_RUN || Date.now() - startedAt > RUN_BUDGET_MS) break;
      handled += 1;
      if (spot.label) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const r = await lookupPlaceName(spot.coords.lat, spot.coords.lng, lang);
        if (r.status === "error") { offline = true; startBackoff(); break; }
        if (r.status === "ok") labels.set(key, { name: r.name, place: r.place || "" }); else emptyMap[`label:${key}`] = now;
      }
      if (spot.water) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const r = await lookupNearbyWater(spot.coords.lat, spot.coords.lng, lang);
        if (r.status === "ok") {
          if (r.water || r.river || r.settlement) {
            spotCache[key] = { water: r.water || null, river: r.river || null, settlement: r.settlement || null };
            if (r.river) rememberRiverName(r.river); // so a stale river group can be recognised

          } else {
            emptyMap[`water:${key}`] = now; // nothing mapped around: retry in a week
          }
        } else {
          startBackoff(); // "error": Overpass is down — ask again later
          offline = true;
        }
      }
    }

    // Bring every own catch in line with what is known about its spot.
    let updated = 0;
    // Re-read right before writing: the user may have edited a catch (or it
    // may have been synced) while the lookups above were running.
    for (const fresh of await getAllCatches()) {
      const w = wanted(fresh);
      if (!w) continue;
      const patch = {};
      const lab = labels.get(w.key);
      if (lab && needsLabel(fresh)) patch.location = lab.name;

      const sp = spotCache[w.key];
      if (sp) {
        // grouping: standing water, else the nearest settlement (never a river)
        const group = sp.water || sp.settlement || "";
        if (group && fresh.water_name !== group) patch.water_name = group;
        else if (!group && fresh.water_name) patch.water_name = "";
        // river fishing: "река — населено място" in the label
        if (!sp.water && sp.river) {
          const current = typeof (patch.location ?? fresh.location) === "string" ? (patch.location ?? fresh.location) : "";
          if (!normName(current).includes(normName(sp.river))) {
            const place = sp.settlement || lab?.place || "";
            patch.location = place ? `${sp.river} — ${place}` : sp.river;
          }
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
    writeJson(SPOT_KEY, spotCache);
    return updated;
  } catch (e) {
    console.error("resolvePendingLocationNames error:", e);
    return 0;
  } finally {
    running = false;
  }
}
