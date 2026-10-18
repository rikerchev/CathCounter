// v3.119 — replaces bare-coordinate catch locations with real place names once
// the connection is back.
//
// When a catch is logged with no internet, reverse geocoding (Nominatim)
// can't run, so geolocation.js stores the coordinates themselves as the
// location text ("43.123456, 26.123456"). That text means nothing to a person.
// This works exactly like the pending-photo upload: the catch keeps its
// coordinates until the app is online, then syncAll() calls
// resolvePendingLocationNames(), which looks up the name and stores it as the
// catch's `location` (marking the record unsynced so the very next
// pushPendingCatches() sends the corrected name to the server).

import { getAllCatches, saveCatchLocal } from "@/lib/localDb";
import { lookupPlaceName } from "@/lib/geolocation";
import { catchCoords, isCoordinateLabel } from "@/lib/catchPlaces";

// Nominatim's usage policy allows at most 1 request/second.
const REQUEST_GAP_MS = 1100;
// Per sync run — the rest is picked up by the next sync.
const MAX_PER_RUN = 8;
// A spot Nominatim had no name for ("empty") isn't asked again for a day.
const EMPTY_RETRY_MS = 24 * 60 * 60 * 1000;
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
const cacheKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function currentLang() {
  try { return localStorage.getItem("appLang") || "bg"; } catch { return "bg"; }
}
function currentUserId() {
  try { return localStorage.getItem(LAST_USER_KEY) || ""; } catch { return ""; }
}

/**
 * Looks up names for catches whose location is empty or only coordinates.
 * Returns how many catches were renamed. Never throws.
 */
export async function resolvePendingLocationNames() {
  try {
    const userId = currentUserId();
    const all = await getAllCatches();
    const pending = all.filter((c) => {
      // Only the user's own catches (an admin's local store can also hold
      // other people's catches, which must not be edited from here).
      if (userId && c.created_by_id && c.created_by_id !== userId) return false;
      const loc = typeof c.location === "string" ? c.location.trim() : "";
      if (loc && !isCoordinateLabel(loc)) return false;
      return !!catchCoords(c);
    });
    if (pending.length === 0) return 0;

    const lang = currentLang();
    const emptyMap = readEmptyMap();
    const now = Date.now();
    const resolved = new Map(); // grid key → name
    let lookups = 0;
    let renamed = 0;

    for (const c of pending) {
      const { lat, lng } = catchCoords(c);
      const key = cacheKey(lat, lng);

      if (!resolved.has(key)) {
        if (emptyMap[key] && now - emptyMap[key] < EMPTY_RETRY_MS) continue;
        if (lookups >= MAX_PER_RUN) continue;
        if (lookups > 0) await sleep(REQUEST_GAP_MS);
        lookups += 1;
        const result = await lookupPlaceName(lat, lng, lang);
        if (result.status === "error") break; // offline again — try next sync
        if (result.status === "empty") {
          emptyMap[key] = now;
          continue;
        }
        resolved.set(key, result.name);
      }

      // Re-read the record right before writing: the user may have edited
      // it (or it may have been synced) while the lookups above were running.
      const fresh = (await getAllCatches()).find((x) => x.id === c.id);
      if (!fresh) continue;
      const freshLoc = typeof fresh.location === "string" ? fresh.location.trim() : "";
      if (freshLoc && !isCoordinateLabel(freshLoc)) continue;

      await saveCatchLocal({
        ...fresh,
        location: resolved.get(key),
        // keep the exact coordinates for the record when only the label had them
        latitude: fresh.latitude ?? lat,
        longitude: fresh.longitude ?? lng,
        _synced: false,
      });
      renamed += 1;
    }

    writeEmptyMap(emptyMap);
    return renamed;
  } catch (e) {
    console.error("resolvePendingLocationNames error:", e);
    return 0;
  }
}
