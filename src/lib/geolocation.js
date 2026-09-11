/**
 * Gets the user's current location (name + coordinates) via reverse geocoding.
 * Uses browser geolocation + OpenStreetMap Nominatim API (free, no key).
 * Returns { name, latitude, longitude }, or coordinates as fallback name.
 */
export async function getCurrentLocation(lang = "en") {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("not_supported"));
      return;
    }

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
        resolve({ name, latitude, longitude });
      } catch {
        resolve({ name: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, latitude, longitude });
      }
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

/** Backward-compatible wrapper returning only the name string. */
export async function getCurrentLocationName(lang = "en") {
  const { name } = await getCurrentLocation(lang);
  return name;
}