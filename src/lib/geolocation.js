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
 * Coarse fix: a single network/cell-tower-based reading (no GPS radio spun
 * up, no multi-second wait for a tight fix) — resolves as soon as the
 * browser has ANY position, and accepts one up to a minute old. This is
 * all a water body needs, since it's identified by its nearest named
 * settlement regardless of exactly where on the bank you're standing —
 * waiting longer for a tighter fix wouldn't change which town/village
 * comes back from the reverse-geocode above. Much faster and far lighter
 * on the battery than the precise mode.
 */
function getCoarseLocation(lang) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        resolve(await reverseGeocode(latitude, longitude, lang));
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/**
 * Gets the user's current location (name + coordinates) via reverse geocoding.
 * Returns { name, latitude, longitude }, or coordinates as fallback name.
 *
 * `precise` (default true) picks how hard the GPS chip works:
 *  - true:  a high-accuracy fix — use this wherever the exact spot matters
 *    (a catch's location/distance).
 *  - false: a single coarse fix — use this for "which water body am I at"
 *    style lookups (e.g. at the start of a session), where only the
 *    nearest settlement's name matters.
 */
export async function getCurrentLocation(lang = "en", precise = true) {
  if (!navigator.geolocation) {
    throw new Error("not_supported");
  }
  return precise ? getPreciseLocation(lang) : getCoarseLocation(lang);
}

/** Backward-compatible wrapper returning only the name string. */
export async function getCurrentLocationName(lang = "en") {
  const { name } = await getCurrentLocation(lang);
  return name;
}
