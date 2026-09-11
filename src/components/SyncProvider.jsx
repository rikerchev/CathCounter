import { useEffect } from "react";
import { initSync, onSyncChange } from "@/lib/syncEngine";

// Initializes the sync engine and online/offline listeners on app load
export default function SyncProvider({ children }) {
  useEffect(() => {
    initSync();
    const unsubscribe = onSyncChange(({ isOnline, syncing }) => {
      // Could show a toast or indicator here

    });
    return unsubscribe;
  }, []);

  return children;
}