// v2.68 — QR referral/sharing system. A user's "code" is simply their own
// account id (no extra DB column needed for it) embedded as ?ref= in a link
// to /register. See src/pages/Home.jsx for the QR/share card and
// src/lib/AuthContext.jsx for where a captured code actually gets redeemed.

const STORAGE_KEY = "pendingReferralCode";

// Reads ?ref= off the CURRENT url (if present) and remembers it in
// sessionStorage. Safe to call unconditionally on every app boot — it's a
// no-op when there's no ?ref= param, and never overwrites a previously
// captured code with an empty one.
export function captureReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) sessionStorage.setItem(STORAGE_KEY, ref);
  } catch {
    // ignore (e.g. sessionStorage blocked)
  }
}

export function getPendingReferralCode() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingReferralCode() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// The link encoded in a user's own invite QR code — sent to /register so it
// also works for someone who doesn't have the app yet, google sign-in
// included (captureReferralFromUrl() runs before the redirect to Google and
// the code survives in sessionStorage across that round trip).
export function getReferralLink(userId) {
  return `${window.location.origin}/register?ref=${userId}`;
}

// v2.69 — "Търговци" printed-brochure QR codes (water bodies and commercial
// venues, see src/pages/WaterBodyManagement.jsx / src/pages/TraderVenues.jsx
// and server/routes/merchantReferrals.ts). Completely independent of the
// peer ?ref= system above — a new account can in principle redeem one of
// each, since only one is ever present on any single printed brochure/link.
const MERCHANT_STORAGE_KEY = "pendingMerchantCode";

export function captureMerchantFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const merchant = params.get("merchant");
    if (merchant) sessionStorage.setItem(MERCHANT_STORAGE_KEY, merchant);
  } catch {
    // ignore
  }
}

export function getPendingMerchantCode() {
  try {
    return sessionStorage.getItem(MERCHANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingMerchantCode() {
  try {
    sessionStorage.removeItem(MERCHANT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// type: "water_body" | "venue"
export function getMerchantBrochureLink(type, id) {
  return `${window.location.origin}/register?merchant=${type}:${id}`;
}
