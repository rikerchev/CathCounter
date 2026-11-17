import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getPendingReferralCode, clearPendingReferralCode, getPendingMerchantCode, clearPendingMerchantCode } from '@/lib/referral';
import { clearAllLocalData } from '@/lib/localDb';

// v3.27 — the local-first IndexedDB store (src/lib/localDb.js) is keyed by
// browser, not by account, so on a shared device where more than one
// CatchCount account logs in over time, the previous account's catches/bait
// would otherwise still be sitting there for the next account to see (see
// clearAllLocalData's own comment for the full mechanism). This key
// remembers which account's data is currently cached on THIS device so a
// mismatch — a different account logging in here — can be caught before
// that account's pages ever load the stale local data.
const LAST_LOCAL_USER_KEY = 'catchcount_last_local_user_id';

// v3.148 — the last successfully loaded user, kept together with a fingerprint
// of the token it was loaded with. A failed /api/auth/me (timeout, dropped
// connection, a cold server) used to be treated as "not signed in" and sent an
// already signed-in person to the login page until they refreshed. Now the app
// opens straight away with this copy and refreshes it in the background; only
// a real 401/403 signs the user out. The copy is used only while the stored
// token is the very one it belongs to.
const CACHED_USER_KEY = 'catchcount_cached_user';

function tokenFingerprint() {
  try {
    const tok = localStorage.getItem('token');
    return tok ? tok.slice(-24) : null;
  } catch {
    return null;
  }
}

function readCachedUser() {
  try {
    const fp = tokenFingerprint();
    if (!fp) return null;
    const saved = JSON.parse(localStorage.getItem(CACHED_USER_KEY) || 'null');
    return saved && saved.fp === fp && saved.user && saved.user.id ? saved.user : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  try {
    const fp = tokenFingerprint();
    if (fp && user && user.id) localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ fp, user }));
  } catch {
    // ignore
  }
}

function clearCachedUser() {
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // ignore
  }
}

// Background re-checks after a transient failure (seconds): 5, 15, 40, 90.
const AUTH_RETRY_DELAYS_MS = [5000, 15000, 40000, 90000];

function isDefiniteRejection(error) {
  return !!error && (error.status === 401 || error.status === 403);
}

// Wipes the local IndexedDB store only if a DIFFERENT account was the last
// one signed in on this device (never for the same account signing back
// in — that would defeat the whole point of local-first offline storage).
// Best-effort: a failure here must never block sign-in.
async function guardLocalDataForUser(userId) {
  if (!userId) return;
  try {
    const lastUserId = localStorage.getItem(LAST_LOCAL_USER_KEY);
    if (lastUserId && lastUserId !== userId) {
      await clearAllLocalData();
    }
    localStorage.setItem(LAST_LOCAL_USER_KEY, userId);
  } catch (e) {
    console.error('guardLocalDataForUser error:', e);
  }
}

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

  const retryTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);

  // Fresh user from the server → state + cached copy. Runs (and completes)
  // guardLocalDataForUser BEFORE the user is exposed, so no page — including
  // SyncProvider's own background sync — can read the local IndexedDB store
  // until it's confirmed to belong to this account (or has just been wiped
  // because it didn't). See its own comment above.
  const applyUser = useCallback(async (currentUser, first) => {
    await guardLocalDataForUser(currentUser.id);
    writeCachedUser(currentUser);
    setUser(currentUser);
    setIsAuthenticated(true);
    setAuthError(null);
    if (first) {
      tryRedeemPendingReferral(setUser);
      tryRedeemPendingMerchant(setUser);
    }
  }, []);

  const signedOut = useCallback((error) => {
    clearCachedUser();
    setUser(null);
    setIsAuthenticated(false);
    if (isDefiniteRejection(error)) {
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // One background check after a transient failure; on another transient
  // failure the next one is scheduled (see AUTH_RETRY_DELAYS_MS).
  const backgroundCheck = useCallback(async () => {
    cancelRetry();
    try {
      await applyUser(await base44.auth.me(), false);
      retryAttemptRef.current = 0;
    } catch (error) {
      if (isDefiniteRejection(error)) {
        signedOut(error);
        return;
      }
      const attempt = retryAttemptRef.current++;
      if (attempt < AUTH_RETRY_DELAYS_MS.length) {
        retryTimerRef.current = setTimeout(backgroundCheck, AUTH_RETRY_DELAYS_MS[attempt]);
      }
    }
  }, [applyUser, signedOut, cancelRetry]);

  // useCache: only for the very first check when the app opens. Later calls
  // (after accepting the terms, saving the phone, ...) need the server's
  // current user, never the saved copy.
  const checkUserAuth = useCallback(async (opts) => {
    cancelRetry();
    retryAttemptRef.current = 0;
    setAuthError(null);

    // Signed in before on this device, same token: open at once with the saved
    // user and confirm in the background.
    const cached = opts && opts.useCache ? readCachedUser() : null;
    if (cached) {
      try {
        await guardLocalDataForUser(cached.id);
      } catch {
        // ignore
      }
      setUser(cached);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      try {
        await applyUser(await base44.auth.me(), true);
      } catch (error) {
        if (isDefiniteRejection(error)) signedOut(error);
        else {
          const attempt = retryAttemptRef.current++;
          retryTimerRef.current = setTimeout(backgroundCheck, AUTH_RETRY_DELAYS_MS[attempt]);
        }
      }
      return;
    }

    setIsLoadingAuth(true);
    try {
      await applyUser(await base44.auth.me(), true);
    } catch (error) {
      signedOut(error);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [applyUser, signedOut, cancelRetry, backgroundCheck]);

  // Back online / app brought to the front while a background check is still
  // pending: ask again now instead of waiting for the timer.
  useEffect(() => {
    const recheck = () => {
      if (retryTimerRef.current && !document.hidden) backgroundCheck();
    };
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
      cancelRetry();
    };
  }, [backgroundCheck, cancelRetry]);

  useEffect(() => {
    checkUserAuth({ useCache: true });
  }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    cancelRetry();
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(false);

    localStorage.removeItem('token');
    clearCachedUser();
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
