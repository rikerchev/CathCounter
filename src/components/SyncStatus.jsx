import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getOnlineStatus, onSyncChange, syncAll } from "@/lib/syncEngine";

// v3.118 — how long the "Офлайн режим" pill stays visible each time it is
// shown (see the effect below). It used to stay on screen the whole time the
// device was offline, covering page content; now it only appears briefly.
const OFFLINE_NOTICE_MS = 4000;

export default function SyncStatus() {
  const [online, setOnline] = useState(getOnlineStatus());
  const [syncing, setSyncing] = useState(false);
  // v3.118 — whether the offline pill is currently visible. Turned on when
  // the page changes (or the connection is first lost) while offline, and
  // turned off again by a timer — never left on permanently.
  const [showOffline, setShowOffline] = useState(false);
  const { pathname } = useLocation();
  const offlineTimerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSyncChange(({ isOnline, syncing }) => {
      setOnline(isOnline);
      setSyncing(syncing);
    });
    setOnline(getOnlineStatus());
    return unsubscribe;
  }, []);

  // v3.118 — show the offline notice once per page change (and once when the
  // connection drops), for a few seconds, instead of continuously. Online:
  // make sure it's hidden and no stale timer is left running.
  useEffect(() => {
    if (offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
    if (online) {
      setShowOffline(false);
      return undefined;
    }
    setShowOffline(true);
    offlineTimerRef.current = setTimeout(() => {
      setShowOffline(false);
      offlineTimerRef.current = null;
    }, OFFLINE_NOTICE_MS);
    return () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };
  }, [pathname, online]);

  if (online && !syncing) return null;
  if (!online && !showOffline) return null;

  return (
    <div
      // bottom offset stacks on top of any bottom ad banner (--bottom-ads-h,
      // set by BottomAdBanner.jsx) instead of a fixed 1rem, so this pill
      // never ends up visually buried inside/behind a bottom banner.
      style={{ bottom: "calc(1rem + var(--bottom-ads-h, 0px))" }}
      className={`fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-medium pointer-events-none ${
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
