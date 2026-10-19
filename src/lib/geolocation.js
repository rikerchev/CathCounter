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

// v3.120 — the name of the WATER BODY (lake, reservoir, river, canal) next to
// a point, from OpenStreetMap via the Overpass API. Nominatim above only names
// the water when the point is inside the water itself, and returns the
// nearest *object* otherwise (a school, a viaduct, a village) — but a
// fisherman stands on the bank. This looks for a named water feature within
// WATER_SEARCH_RADIUS_M instead, so catches can be grouped by the water body
// even for state-owned ones that were never registered in the app.
//
// Same three-way result as lookupPlaceName(): { status: "ok", name, kind } /
// { status: "empty" } (answered, no named water nearby) / { status: "error" }
// (no answer — offline, timeout, overloaded server; worth retrying later).
//
// v3.126 — `kind` tells a STANDING water ("water": язовир, езеро, рибарник,
// гьол, микроязовир, старо корито …) from a flowing one ("river": река, канал,
// поток). Catches are grouped by standing water only. A river is far too long
// to be "a place" (Бели Лом is 200 km, Дунав is the whole northern border), so
// for river fishing the caller keeps the catch's own place label and adds the
// river + the settlement to it instead of grouping by the river. A standing
// water within reach always wins over a river running next to it.
const WATER_SEARCH_RADIUS_M = 250;
// v3.123 — only overpass-api.de: the kumi.systems mirror sends no CORS headers,
// so every browser request to it was blocked (and still cost time/console
// errors on each attempt).
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter"];
// natural=water + water=<one of these> is a river/canal drawn as an area.
const FLOWING_WATER_VALUES = new Set(["river", "canal", "stream", "riverbank", "ditch", "drain", "stream_pool"]);

export async function lookupNearbyWater(latitude, longitude, lang) {
  const around = `around:${WATER_SEARCH_RADIUS_M},${latitude},${longitude}`;
  const query =
    `[out:json][timeout:10];(` +
    `way(${around})["natural"="water"]["name"];` +
    `way(${around})["landuse"~"^(reservoir|basin|aquaculture)$"]["name"];` +
    `way(${around})["waterway"~"^(river|canal|stream)$"]["name"];` +
    `)->.w;(` +
    `relation(${around})["natural"="water"]["name"];` +
    `relation(${around})["landuse"~"^(reservoir|basin|aquaculture)$"]["name"];` +
    `)->.r;` +
    `.w out tags geom 40;.r out tags center 10;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) continue; // overloaded / rate limited — try the next mirror
      const data = await res.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      let bestStill = null; let bestStillD = Infinity;
      let bestRiver = null; let bestRiverD = Infinity;
      for (const el of elements) {
        const tags = el.tags || {};
        const name = (tags[`name:${lang}`] || tags.name || "").trim();
        if (!name) continue;
        const flowing = !!tags.waterway || FLOWING_WATER_VALUES.has(tags.water);
        // distance: nearest vertex of the way (rivers are long, so their
        // "centre" says nothing), else the element's centre
        let dist = Infinity;
        if (Array.isArray(el.geometry)) {
          for (const p of el.geometry) {
            if (p && typeof p.lat === "number") dist = Math.min(dist, distanceMeters(latitude, longitude, p.lat, p.lon));
          }
        }
        if (!Number.isFinite(dist) && el.center) dist = distanceMeters(latitude, longitude, el.center.lat, el.center.lon);
        if (!Number.isFinite(dist)) dist = 0;
        if (flowing) {
          if (dist < bestRiverD) { bestRiverD = dist; bestRiver = name; }
        } else if (dist < bestStillD) { bestStillD = dist; bestStill = name; }
      }
      if (bestStill) return { status: "ok", name: bestStill, kind: "water" };
      if (bestRiver) return { status: "ok", name: bestRiver, kind: "river" };
      return { status: "empty" };
    } catch {
      // timeout / network error — try the next mirror, else report "error"
    } finally {
      clearTimeout(timer);
    }
  }
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
