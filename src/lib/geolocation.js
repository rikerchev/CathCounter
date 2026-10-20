/**
 * Reverse-geocodes coordinates into a human-readable place name via
 * OpenStreetMap Nominatim (free, no key). Shared by both accuracy modes
 * below — the only thing that differs between them is how the fix itself
 * is obtained, not what happens to it afterwards.
 */
// v3.119 — the actual Nominatim lookup, split out of reverseGeocode() so
// callers can tell apart the three outcomes that used to all collapse into
// "show raw coordinates":
//   { status: "ok", name }  — a human-readable name was found
//   { status: "empty" }     — Nominatim answered, but has no name for this spot
//   { status: "error" }     — no answer at all (offline, timeout, rate limit)
// reverseGeocode() below still behaves exactly as before for every existing
// caller (it falls back to coordinates for both "empty" and "error"); the new
// lookupPlaceName() export is used by locationNames.js to later replace
// coordinate-only catch locations with real names once the connection is back
// — and to know whether a retry could ever help ("error") or not ("empty").
export async function lookupPlaceName(latitude, longitude, lang) {
  // v3.123 — a lookup that never answers must not hang whatever awaits it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1&accept-language=${lang}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    const a = data.address || {};
    // For fishing spots: use nearest named place as label, coordinates are primary
    const placeName = a.neighbourhood || a.suburb || a.hamlet || a.village || a.town || a.city || a.municipality;
    const waterName = a.water || a.reservoir || a.river || a.lake || data.namedetails?.name;
    const region = a.state_district || a.state || a.county;
    const labelParts = [waterName, placeName, region].filter(Boolean);
    const name = labelParts.length > 0
      ? labelParts.slice(0, 2).join(" — ")
      : data.display_name?.split(",").slice(0, 2).join(", ");
    // v3.126 — the settlement alone (used to label river fishing "река — село").
    return name ? { status: "ok", name, place: placeName || "" } : { status: "empty" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

// v3.132 — the settlement a spot belongs to, from Nominatim (zoom 12 = the
// village/town/city level, so a field between villages answers with the one
// whose land it is). { ok: true, name } (name may be "") or { ok: false }.
async function lookupSettlement(latitude, longitude, lang) {
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim: ~1 request/second
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=12&addressdetails=1&accept-language=${lang}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const a = (data && data.address) || {};
    return { ok: true, name: a.village || a.town || a.city || a.hamlet || "" };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// v3.120 — the name of the WATER BODY (lake, reservoir, pond …) next to a
// point, from OpenStreetMap via the Overpass API. Nominatim above only names
// the water when the point is inside the water itself, and returns the
// nearest *object* otherwise (a school, a viaduct, a village) — but a
// fisherman stands on the bank. This looks for a named water feature within
// WATER_SEARCH_RADIUS_M instead, so catches can be grouped by the water body
// even for state-owned ones that were never registered in the app.
//
// v3.126/v3.127 — one request answers everything the grouping needs:
//   water       the nearest named STANDING water (язовир, езеро, рибарник,
//               гьол, микроязовир, старо корито …) within reach, else null;
//   river       the nearest named river/canal/stream within reach, else null;
//   settlement  the nearest named city/town/village (OSM place nodes within
//               zoom 12, v3.132: Nominatim), else null.
// Catches are grouped by `water` when there is one, otherwise by the nearest
// `settlement` — never by a river (Бели Лом is 200 km long, Дунав is the whole
// northern border). For river fishing the location label gets the river and
// the settlement added ("Бели лом — Дряново").
//
// Result: { status: "ok", water, river, settlement } or { status: "error" }
// (no answer — offline, timeout, overloaded server; worth retrying later).
const WATER_SEARCH_RADIUS_M = 250;
// v3.123 — only overpass-api.de: the kumi.systems mirror sends no CORS headers,
// so every browser request to it was blocked (and still cost time/console
// errors on each attempt).
// v3.133 — overpass-api.de often answers 502 when busy; a second public
// instance (private.coffee, sends CORS headers) is tried after it. A mirror that
// blocks the request just falls through to "error" like any other failure.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
// natural=water + water=<one of these> is a river/canal drawn as an area.
const FLOWING_WATER_VALUES = new Set(["river", "canal", "stream", "riverbank", "ditch", "drain", "stream_pool"]);
// v3.131 — telling a river drawn as an area from a real standing water.
// geometry is clipped to ~1.2 km around the spot (see lookupNearbyWater), so a
// strip reaching across most of that window is a river, not a pond.
const RIVER_STRIP_EXTENT_M = 1000;
const RIVER_NAME_RE = /^\s*(?:река|р\.|river|reka)\b/i;
const STANDING_WORD_RE = /(?:язовир|яз\.|микроязовир|езеро|рибарник|гьол|блато|бент|дига|lake|reservoir|pond|dam)/i;
// lower case, no quotes, no leading "река"/"р." — so "р. Бели Лом" = "Бели лом"
const normalizeGeoName = (name) =>
  String(name || "")
    .replace(/[„“”"«»'`‘’()]/g, " ")
    .replace(/^\s*(?:река|р\.|river)\s+/i, "")
    .trim()
    .toLocaleLowerCase();

export async function lookupNearbyWater(latitude, longitude, lang) {
  const around = `around:${WATER_SEARCH_RADIUS_M},${latitude},${longitude}`;
  // v3.132 — Overpass only answers the cheap part (named waters within 250 m).
  // The 10 km "nearest village" search that used to ride along in the same
  // query made overpass-api.de time out / answer 502 for every spot; the
  // settlement now comes from Nominatim (lookupSettlement) and only when no
  // standing water was found.
  // The river's geometry is clipped to a window around the spot (geom(bbox)):
  // a whole river way can be thousands of points.
  const dLat = 0.005;
  const dLng = 0.008;
  const bbox = `${(latitude - dLat).toFixed(5)},${(longitude - dLng).toFixed(5)},${(latitude + dLat).toFixed(5)},${(longitude + dLng).toFixed(5)}`;
  const buildQuery = (trimmed) =>
    `[out:json][timeout:15];(` +
    `way(${around})["natural"="water"]["name"];` +
    `way(${around})["landuse"~"^(reservoir|basin|aquaculture)$"]["name"];` +
    `way(${around})["waterway"~"^(river|canal|stream|riverbank)$"]["name"];` +
    `)->.w;(` +
    `relation(${around})["natural"="water"]["name"];` +
    `relation(${around})["landuse"~"^(reservoir|basin|aquaculture)$"]["name"];` +
    `)->.r;` +
    `.w out tags ${trimmed ? `geom(${bbox})` : "geom"} 40;.r out tags center 10;`;
  const queries = [buildQuery(true), buildQuery(false)]; // the 2nd only if the 1st is rejected (HTTP 400)

  for (const endpoint of OVERPASS_ENDPOINTS) {
   for (const query of queries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (res.status === 400) continue; // query rejected → try the plain variant
      if (!res.ok) { console.warn("[overpass] HTTP", res.status); break; } // overloaded / rate limited — no point in retrying now
      const data = await res.json();
      // Overpass answers 200 with a "remark" when it ran out of time/memory;
      // that is NOT "nothing is mapped here" (it would be cached for a week).
      if (data.remark && /runtime error|timed out|out of memory/i.test(String(data.remark))) {
        console.warn("[overpass] remark:", data.remark);
        break;
      }
      const elements = Array.isArray(data.elements) ? data.elements : [];
      let river = null; let riverD = Infinity;
      let settlement = null; let settlementD = Infinity;
      const standing = []; // { name, dist, extent } — decided below
      const flowingNames = new Set();
      for (const el of elements) {
        const tags = el.tags || {};
        const name = (tags[`name:${lang}`] || tags.name || "").trim();
        if (!name) continue;
        if (el.type === "node" && tags.place) {
          if (typeof el.lat === "number") {
            const d = distanceMeters(latitude, longitude, el.lat, el.lon);
            if (d < settlementD) { settlementD = d; settlement = name; }
          }
          continue;
        }
        const flowing = !!tags.waterway || FLOWING_WATER_VALUES.has(tags.water);
        // distance: nearest vertex of the way (rivers are long, so their
        // "centre" says nothing), else the element's centre
        let dist = Infinity;
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        if (Array.isArray(el.geometry)) {
          for (const p of el.geometry) {
            if (p && typeof p.lat === "number") {
              dist = Math.min(dist, distanceMeters(latitude, longitude, p.lat, p.lon));
              minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
              minLng = Math.min(minLng, p.lon); maxLng = Math.max(maxLng, p.lon);
            }
          }
        }
        if (!Number.isFinite(dist) && el.center) dist = distanceMeters(latitude, longitude, el.center.lat, el.center.lon);
        if (!Number.isFinite(dist)) dist = 0;
        const extent = Number.isFinite(minLat) ? distanceMeters(minLat, minLng, maxLat, maxLng) : 0;
        if (flowing) {
          flowingNames.add(normalizeGeoName(name));
          if (dist < riverD) { riverD = dist; river = name; }
        } else {
          standing.push({ name, dist, extent });
        }
      }
      // v3.131 — a river is often also drawn as a wide AREA tagged
      // natural=water without water=river, which looked like a "standing
      // water" named like the river (catches of a pond beside Бели Лом ended up
      // in the group "Бели лом"). Such an area is a river when
      //   - a river/stream line with the same name is in the answer, or
      //   - its name starts with "река"/"р."/"river", or
      //   - it is a long strip (> RIVER_STRIP_EXTENT_M) with no standing-water
      //     word in its name while a river is nearby.
      let water = null; let waterD = Infinity;
      for (const w of standing) {
        const nn = normalizeGeoName(w.name);
        const asRiver =
          flowingNames.has(nn) ||
          RIVER_NAME_RE.test(w.name) ||
          (w.extent > RIVER_STRIP_EXTENT_M && !STANDING_WORD_RE.test(w.name) && river);
        if (asRiver) {
          if (w.dist < riverD) { riverD = w.dist; river = w.name; }
        } else if (w.dist < waterD) { waterD = w.dist; water = w.name; }
      }
      if (!water && !settlement) {
        const st = await lookupSettlement(latitude, longitude, lang);
        if (!st.ok) return { status: "error" }; // grouping needs it → ask again later
        settlement = st.name;
      }
      return { status: "ok", water, river, settlement };
    } catch (err) {
      // timeout / network error — report "error" below
      console.warn("[overpass] request failed:", err && err.name ? err.name : err);
    } finally {
      clearTimeout(timer);
    }
   }
  }
  // v3.133 — no Overpass instance answered. The spot still needs a group, so
  // fall back to the settlement alone (Nominatim) and mark the answer
  // PROVISIONAL: locationNames.js asks Overpass again later and replaces it
  // when a standing water turns out to be mapped nearby.
  const st = await lookupSettlement(latitude, longitude, lang);
  if (st.ok && st.name) return { status: "ok", water: null, river: null, settlement: st.name, provisional: true };
  return { status: "error" };
}

async function reverseGeocode(latitude, longitude, lang) {
  const result = await lookupPlaceName(latitude, longitude, lang);
  const name = result.status === "ok"
    ? result.name
    : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  return { name, latitude, longitude };
}

/**
 * High-accuracy fix: watches the GPS chip for up to 5 seconds (or until a
 * fix better than 10m arrives, whichever is first), then reverse-geocodes
 * the best position seen. Used wherever the EXACT spot matters — a catch's
 * own location/distance, where a few tens of meters can be the difference
 * between two swims.
 */
function getPreciseLocation(lang) {
  return new Promise((resolve, reject) => {
    let bestPos = null;
    let bestAccuracy = Infinity;
    let resolved = false;
    let watchId = null;
    let settleTimer = null;

    const finish = async () => {
      if (resolved) return;
      resolved = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (settleTimer) clearTimeout(settleTimer);

      const pos = bestPos || { coords: { latitude: null, longitude: null } };
      const { latitude, longitude } = pos.coords;
      if (latitude === null || longitude === null) {
        reject(new Error("position_unavailable"));
        return;
      }
      resolve(await reverseGeocode(latitude, longitude, lang));
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? Infinity;
        if (acc < bestAccuracy) {
          bestAccuracy = acc;
          bestPos = pos;
        }
        // If we get a very accurate fix (<10m), settle immediately
        if (acc < 10) finish();
      },
      (err) => {
        if (bestPos) {
          finish();
        } else {
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          if (settleTimer) clearTimeout(settleTimer);
          reject(err);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    // Settle after 5 seconds of collecting positions, using the best one
    settleTimer = setTimeout(finish, 5000);
  });
}

/**
 * Coarse fix: a single reading, resolved as soon as the browser has ANY
 * position, and happy to reuse one up to a minute old — no multi-sample
 * 5-second wait for a tight (<10m) fix like the precise mode does. This is
 * all a water body needs, since it's identified by its nearest named
 * settlement regardless of exactly where on the bank you're standing.
 *
 * This still asks for `enableHighAccuracy: true` (i.e. lets the device use
 * GPS), even though the intent is a "coarse" fix — NOT for a tighter
 * result, but for reliability: `enableHighAccuracy: false` tells the
 * browser it's free to rely on WiFi/cell-tower positioning only, and at a
 * genuinely remote fishing spot there may be no WiFi networks nearby and
 * only a weak or absent cell signal for it to use, which can make the fix
 * fail outright with nothing to fall back on. GPS works via satellites
 * with no network at all, so it's what actually makes this reliable
 * everywhere a precise fix would have worked. The real savings here come
 * from settling for the first position report instead of watching for
 * several seconds to refine it, and from accepting a recent cached fix
 * (maximumAge) instead of always asking for a brand new one.
 */
function getCoarseLocation(lang) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        resolve(await reverseGeocode(latitude, longitude, lang));
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

/**
 * Gets the user's current location (name + coordinates) via reverse geocoding.
 * Returns { name, latitude, longitude }, or coordinates as fallback name.
 *
 * `precise` (default true) picks how hard the fix works:
 *  - true:  watches for up to 5s (or until a fix better than 10m arrives)
 *    and keeps the best one seen — use this wherever the exact spot
 *    matters (a catch's location/distance).
 *  - false: a single, quick fix, reused if one under a minute old is
 *    already available — use this for "which water body am I at" style
 *    lookups (e.g. at the start of a session), where only the nearest
 *    settlement's name matters. If this quick fix fails outright for any
 *    reason, this transparently falls back to the same precise fetch as
 *    `true` uses, so a coarse-mode caller is never less reliable than a
 *    precise one — only faster/lighter when the quick fix succeeds.
 */
export async function getCurrentLocation(lang = "en", precise = true) {
  if (!navigator.geolocation) {
    throw new Error("not_supported");
  }
  if (precise) return getPreciseLocation(lang);
  try {
    return await getCoarseLocation(lang);
  } catch {
    return getPreciseLocation(lang);
  }
}

/** Backward-compatible wrapper returning only the name string. */
export async function getCurrentLocationName(lang = "en") {
  const { name } = await getCurrentLocation(lang);
  return name;
}

/**
 * Great-circle distance between two coordinates, in meters (haversine
 * formula). Used to decide whether a catch was landed from the same swim
 * as the previous one, or somewhere genuinely different — see
 * ActiveSession.jsx's handleSaveCatch.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
