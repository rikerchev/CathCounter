// Platform payment configuration.
//
// v2.77 — the platform-commission split (25% platform / 75% owner) and its
// calcOwnerPayout()/calcPlatformCommission() helpers were removed together
// with the "pay for a sector reservation via Revolut" flow (see
// SectorReservations.jsx and the "Pending Transfers" panel that used to be
// in WaterBodyManagement.jsx) — see claude/... project doc for the merchant
// restructuring this was part of. PLATFORM_REVOLUT_URL is kept: competition
// entry fees (Competitions.jsx) still use it and were NOT part of that
// change — only reservation payments and the commission split were removed.
export const PLATFORM_REVOLUT_TAG = "rkerchev";
export const PLATFORM_REVOLUT_URL = "https://revolut.me/rkerchev";
