import { useState, useEffect } from "react";

/**
 * usePremium — tracks whether the user has a premium (ad-free) subscription.
 * Stored in localStorage for now; upgrade to verify via Stripe webhook/entitlement.
 */
export function usePremium() {
  const [isPremium, setIsPremium] = useState(() => {
    try {
      return localStorage.getItem("appPremium") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("appPremium", String(isPremium));
    } catch {
      // ignore
    }
  }, [isPremium]);

  const activatePremium = () => setIsPremium(true);
  const deactivatePremium = () => setIsPremium(false);

  return { isPremium, activatePremium, deactivatePremium };
}