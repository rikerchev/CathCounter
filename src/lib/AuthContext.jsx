import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getPendingReferralCode, clearPendingReferralCode, getPendingMerchantCode, clearPendingMerchantCode } from '@/lib/referral';

// v2.68 — if a ?ref=<code> invite link/QR was captured earlier (see
// captureReferralFromUrl() in App.jsx), try to redeem it now that we know
// who's logged in. Deliberately swallows every outcome except a genuine
// network/server hiccup: "invalid", "already used", "your own code" and
// "account too old" are all equally final from the caller's point of view
// (see server/routes/referrals.ts) — nothing left to retry, so the stored
// code is cleared either way. A 5xx/offline failure leaves it in place so
// the next auth check (e.g. after the admin applies the v2.68 database
// update) tries again instead of silently losing a legitimate invite.
async function tryRedeemPendingReferral(setUser) {
  const code = getPendingReferralCode();
  if (!code) return;
  try {
    const result = await base44.referrals.redeem(code);
    clearPendingReferralCode();
    if (result?.success) {
      // Pull the fresh premium_until into the user object already in state.
      try {
        const refreshed = await base44.auth.me();
        setUser(refreshed);
      } catch {
        // non-fatal — the redemption itself already succeeded
      }
    }
  } catch (err) {
    if (err?.status && err.status < 500) {
      // A definitive rejection from the server (400/401/409/...) — nothing
      // about retrying it would change the outcome.
      clearPendingReferralCode();
    }
    // else: leave the code stored, try again on the next checkUserAuth()
  }
}

// v2.69 — same idea as tryRedeemPendingReferral above, for a printed
// brochure's ?merchant=<type:id> code (see server/routes/merchantReferrals.ts
// and src/lib/referral.js). Completely independent of the peer-invite one:
// both can be attempted for the same account, since only one code is ever
// present on any single link/QR a person actually followed.
async function tryRedeemPendingMerchant(setUser) {
  const code = getPendingMerchantCode();
  if (!code) return;
  try {
    const result = await base44.merchantReferrals.redeem(code);
    clearPendingMerchantCode();
    if (result?.success) {
      try {
        const refreshed = await base44.auth.me();
        setUser(refreshed);
      } catch {
        // non-fatal
      }
    }
  } catch (err) {
    if (err?.status && err.status < 500) {
      clearPendingMerchantCode();
    }
  }
}

const AuthContext = createContext();

// NOTE: the old version of this file also gated the app behind Base44's own
// "app public settings" endpoint (is auth required for this app, is this
// user registered for it, etc.) — that was a Base44-platform hosting concept
// with no equivalent now that this is self-hosted. Anyone who registers
// through /api/auth/register has an account, full stop, so `authError` here
// only ever reports a real authentication problem (missing/expired token).
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      tryRedeemPendingReferral(setUser);
      tryRedeemPendingMerchant(setUser);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(false);

    localStorage.removeItem('token');
    localStorage.removeItem('base44_access_token'); // stale key from the old client, harmless to clear

    if (shouldRedirect) {
      const loginUrl = `${window.location.origin}/login`;
      base44.auth.logout(loginUrl);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false, // kept for backward compat with existing call sites
      authError,
      appPublicSettings: null,        // kept for backward compat with existing call sites
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth,   // old name, same job now that there's no separate app-state check
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
