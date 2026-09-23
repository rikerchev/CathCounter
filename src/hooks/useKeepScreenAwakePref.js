import { useEffect, useState } from "react";
import { getKeepScreenAwake, setKeepScreenAwake, subscribeKeepScreenAwake } from "@/lib/batteryPrefs";

// v3.47 — small hook wrapper around batteryPrefs.js's pub-sub, mirroring
// useOnlineStatus.js's own wrapper around syncEngine.js. Returns
// [keepScreenAwake, setKeepScreenAwake] like useState, but backed by
// localStorage and shared across every component that calls this hook —
// so toggling it in Profile.jsx is picked up immediately by
// useRodTimerMonitor.js's wake-lock gate too, even though they're separate
// component trees.
export function useKeepScreenAwakePref() {
  const [value, setValue] = useState(getKeepScreenAwake);

  useEffect(() => subscribeKeepScreenAwake(setValue), []);

  return [value, setKeepScreenAwake];
}
