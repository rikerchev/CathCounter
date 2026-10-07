import { useEffect, useState } from "react";
import { getSingleBeepAlert, setSingleBeepAlert, subscribeSingleBeepAlert } from "@/lib/batteryPrefs";

// v3.112 — mirrors useKeepScreenAwakePref.js exactly, for the same reason:
// shared, localStorage-backed state between Profile.jsx's toggle and
// useRodTimerMonitor.js's reminder-beep logic, without them being nested
// in the same component tree.
export function useSingleBeepAlertPref() {
  const [value, setValue] = useState(getSingleBeepAlert);

  useEffect(() => subscribeSingleBeepAlert(setValue), []);

  return [value, setSingleBeepAlert];
}
