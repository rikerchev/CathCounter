import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// v3.119 — approved water bodies that have coordinates, as { id, name, lat,
// lng }. Used by catchPlaces.js to group catches by the water body they were
// caught at. The list is cached in localStorage so the grouping still works
// offline (the fishing spot is exactly where connectivity is worst); a failed
// fetch simply keeps whatever was cached.

const CACHE_KEY = "approvedWaterBodiesCache";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — fine, just no offline cache */
  }
}

let inFlight = null;

function fetchWaterBodies() {
  if (!inFlight) {
    inFlight = base44.entities.WaterBody.list()
      .then((all) =>
        (all || [])
          .filter((w) => w.status === "approved")
          .map((w) => ({
            id: w.id,
            name: w.name,
            lat: parseFloat(w.latitude),
            lng: parseFloat(w.longitude),
          }))
          .filter((w) => w.name && Number.isFinite(w.lat) && Number.isFinite(w.lng))
      )
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export default function useApprovedWaterBodies() {
  const [waterBodies, setWaterBodies] = useState(readCache);

  useEffect(() => {
    let cancelled = false;
    fetchWaterBodies()
      .then((list) => {
        if (cancelled) return;
        writeCache(list);
        setWaterBodies(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return waterBodies;
}
