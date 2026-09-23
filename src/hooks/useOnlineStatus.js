import { useEffect, useState } from "react";
import { getOnlineStatus, onSyncChange } from "@/lib/syncEngine";

// v3.46 — thin hook wrapper around syncEngine.js's own connectivity
// tracking, which is already this app's one source of truth for "are we
// online" (see SyncStatus.jsx for the same getOnlineStatus()/onSyncChange()
// dance, and syncEngine.js's own window "online"/"offline" listeners,
// which already debounce a flaky reconnect burst). Reusing it here — rather
// than adding a second, independent navigator.onLine listener — means ad
// banners (see AdBannerItem.jsx) react to exactly the same online/offline
// signal as the rest of the app, including its existing debounce.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(getOnlineStatus());

  useEffect(() => {
    const unsubscribe = onSyncChange(({ isOnline: online }) => setIsOnline(online));
    setIsOnline(getOnlineStatus());
    return unsubscribe;
  }, []);

  return isOnline;
}
