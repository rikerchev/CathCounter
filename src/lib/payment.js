// Platform payment configuration
// All payments go 100% to the platform owner's Revolut account.
// Admin manually transfers 75% to water body owners via bank transfer (Revolut → IBAN).
export const PLATFORM_REVOLUT_TAG = "rkerchev";
export const PLATFORM_REVOLUT_URL = "https://revolut.me/rkerchev";
export const PLATFORM_COMMISSION_PERCENT = 25; // platform keeps 25%
export const OWNER_PAYOUT_PERCENT = 75; // owner receives 75%

export function calcOwnerPayout(amount) {
  return Math.round(amount * OWNER_PAYOUT_PERCENT) / 100;
}

export function calcPlatformCommission(amount) {
  return Math.round(amount * PLATFORM_COMMISSION_PERCENT) / 100;
}