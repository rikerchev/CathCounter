import { useEffect } from "react";
import { initSync, onSyncChange } from "@/lib/syncEngine";

// Initializes the sync engine and online/offline listeners on app load
export default function SyncProvider({ children }) {
  useEffect(() => {
    initSync();

    // v3.82 — sweep genuinely orphaned pending photos (never linked to any
    // catch, and never uploaded either) once per app load. This is a pure
    // local IndexedDB cleanup — no network needed — so it runs regardless
    // of online status, unlike initSync() above. Dynamically imported to
    // match the existing code-splitting pattern for pendingPhotos.js (see
    // syncEngine.js's syncAll()). See cleanupOrphanedPendingPhotos() in
    // pendingPhotos.js for exactly what counts as orphaned.
    import("@/lib/pendingPhotos").then(({ cleanupOrphanedPendingPhotos }) => {
      cleanupOrphanedPendingPhotos().catch((e) => {
        console.error("cleanupOrphanedPendingPhotos failed:", e);
      });
    });

    const unsubscribe = onSyncChange(({ isOnline, syncing }) => {
      // Could show a toast or indicator here

    });
    return unsubscribe;
  }, []);

  return children;
}