import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getOnlineStatus, onSyncChange, syncAll } from "@/lib/syncEngine";

export default function SyncStatus() {
  const [online, setOnline] = useState(getOnlineStatus());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = onSyncChange(({ isOnline, syncing }) => {
      setOnline(isOnline);
      setSyncing(syncing);
    });
    setOnline(getOnlineStatus());
    return unsubscribe;
  }, []);

  if (online && !syncing) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-medium ${
        online
          ? "bg-cyan-600 text-white"
          : "bg-slate-700 text-white"
      }`}
    >
      {online ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Синхронизиране...
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          Офлайн режим — данните се пазят локално
        </>
      )}
    </div>
  );
}