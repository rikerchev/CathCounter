import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";

/**
 * usePremium — tracks whether the user has a premium (ad-free) subscription.
 *
 * Two independent sources, either one is enough (isPremium = OR of both):
 *  1. The original per-device localStorage flag (activatePremium/
 *     deactivatePremium) — still what Profile.jsx's manual Stripe checkout
 *     flow flips; left completely untouched so that existing purchase path
 *     keeps working exactly as before.
 *  2. v2.68 — an account-wide, server-tracked, EXPIRING `premium_until` on
 *     the authenticated user (see server/routes/referrals.ts), earned by
 *     inviting friends via the QR/link on the Dashboard (src/pages/Home.jsx)
 *     and by friends who scan it and register. Stacks with a 7-day bonus per
 *     successful invite, capped at 60 days out from now.
 */
export function usePremium() {
  const { user, checkUserAuth } = useAuth();

  const [isLegacyPremium, setIsLegacyPremium] = useState(() => {
    try {
      return localStorage.getItem("appPremium") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("appPremium", String(isLegacyPremium));
    } catch {
      // ignore
    }
  }, [isLegacyPremium]);

  const activatePremium = () => setIsLegacyPremium(true);
  const deactivatePremium = () => setIsLegacyPremium(false);

  const premiumUntil = user?.premium_until ? new Date(user.premium_until) : null;
  const referralPremiumActive = Boolean(premiumUntil && premiumUntil.getTime() > Date.now());
  const referralDaysLeft = referralPremiumActive
    ? Math.max(1, Math.ceil((premiumUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  const isPremium = isLegacyPremium || referralPremiumActive;

  return {
    isPremium,
    activatePremium,
    deactivatePremium,
    // v2.68 additions — used by Home.jsx's "Покани приятел" card.
    premiumUntil,
    referralPremiumActive,
    referralDaysLeft,
    refreshPremium: checkUserAuth,
  };
}
