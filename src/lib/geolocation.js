/**
 * Reverse-geocodes coordinates into a human-readable place name via
 * OpenStreetMap Nominatim (free, no key). Shared by both accuracy modes
 * below — the only thing that differs between them is how the fix itself
 * is obtained, not what happens to it afterwards.
 */
async function reverseGeocode(latitude, longitude, lang) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1&accept-language=${lang}`,
      { headers: { Accept: "application/json" } }
    );
    const data = await res.json();
    const a = data.address || {};
    // For fishing spots: use nearest named place as label, coordinates are primary
    const placeName = a.neighbourhood || a.suburb || a.hamlet || a.village || a.town || a.city || a.municipality;
    const waterName = a.water || a.reservoir || a.river || a.lake || data.namedetails?.name;
    const region = a.state_district || a.state || a.county;
    const labelParts = [waterName, placeName, region].filter(Boolean);
    const name = labelParts.length > 0
      ? labelParts.slice(0, 2).join(" — ")
      : data.display_name?.split(",").slice(0, 2).join(", ") ||
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    return { name, latitude, longitude };
  } catch {
    return { name: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, latitude, longitude };
  }
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
