import { useEffect, useState } from "react";

// v3.148 — a counter that goes up each time the background sync (syncEngine.js
// syncAll) has finished and the local IndexedDB store may have changed. A page
// that reads local data adds it to its loading effect's dependencies so it
// shows the newest data without a manual refresh.
export const DATA_SYNCED_EVENT = "catchcount:data-synced";

export default function useSyncVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onSynced = () => setVersion((v) => v + 1);
    window.addEventListener(DATA_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(DATA_SYNCED_EVENT, onSynced);
  }, []);
  return version;
}
