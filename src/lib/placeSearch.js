// v3.194 — address / place search for the "Бъди подготвен" map, via OpenStreetMap
// Nominatim (free, no key). Called only when the angler presses search (the
// service allows about one request per second) — never while typing.

/** -> [{ name, lat, lng }] (up to 5), [] when nothing is found. Throws on a network error. */
export async function searchPlaces(query, lang = "en") {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
    if (!res.ok) throw new Error("search_failed");
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        name: String(r.display_name || "").split(",").slice(0, 3).join(",").trim(),
        lat: Number(r.lat),
        lng: Number(r.lon),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } finally {
    clearTimeout(timer);
  }
}
