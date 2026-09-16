// Platform payment configuration.
//
// v2.77 — the platform-commission split (25% platform / 75% owner) and its
// calcOwnerPayout()/calcPlatformCommission() helpers were removed together
// with the "pay for a sector reservation via Revolut" flow (see
// SectorReservations.jsx and the "Pending Transfers" panel that used to be
// in WaterBodyManagement.jsx) — see claude/... project doc for the merchant
// restructuring this was part of.
//
// v2.79 — the competition entry-fee "pay via Revolut" flow in
// Competitions.jsx was paused too (for now — not a permanent removal like
// v2.77's), so nothing in the app currently imports these two constants.
// Left in place rather than deleted so re-enabling that flow later is just
// re-adding the UI, not re-inventing the payment link.
export const PLATFORM_REVOLUT_TAG = "rkerchev";
export const PLATFORM_REVOLUT_URL = "https://revolut.me/rkerchev";
