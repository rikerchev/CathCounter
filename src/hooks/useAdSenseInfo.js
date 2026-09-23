import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// v3.30 — pulled out of AdSenseLoader.jsx (unchanged behaviour there) so
// the new per-slot manual AdSense units (AdSenseSlot.jsx, used when an
// admin picks "Google AdSense" as a banner's source in AdManagement.jsx)
// can share the same { enabled, publisherId } fetch instead of each
// component hitting /api/settings/adsense on its own. `publisherId` is the
// account-wide AdSense client id (needed on every ad unit, manual or auto);
// `enabled` only gates the global Auto-ads script in AdSenseLoader.jsx — a
// manual per-slot unit is controlled by that slot's own source_type
// instead, so consumers of just `publisherId` don't need to check it.
export function useAdSenseInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    base44.settings
      .getAdSenseInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  return { enabled: !!info?.enabled, publisherId: info?.publisherId || null };
}
