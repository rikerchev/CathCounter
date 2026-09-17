// Drop-in replacement for the removed `@base44/sdk`. It exposes the exact
// same shape (`base44.entities.X.list/filter/create/update/delete`,
// `base44.auth.*`, `base44.functions.invoke`, `base44.integrations.Core.*`,
// `base44.users.inviteUser`) so the ~45 files that import `{ base44 }` from
// here did not need to change. Only this file talks to the network.

// Same-origin by default — the API now lives in the SAME Vercel project as
// this frontend (api/[...path].ts at the repo root), so no separate backend
// URL needs to be configured at all. Set VITE_API_URL only if the API is
// ever hosted on a different origin (e.g. the optional standalone
// server/main.ts running elsewhere).
const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "token";

// Builds an absolute URL for a same-API path — needed by callers that fetch
// a resource directly (not through apiFetch's JSON request/response
// handling), e.g. downloading a catch photo's raw bytes for the global
// backup (src/lib/globalBackup.js).
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// A Google-login redirect comes back as a full-page navigation to
// `/...#access_token=...` (see server/routes/auth.ts google/callback) since
// there's no XHR to hand the token back through. Capture it once on boot.
(function captureTokenFromUrlHash() {
  if (typeof window === "undefined") return;
  const match = window.location.hash.match(/access_token=([^&]+)/);
  if (match) {
    localStorage.setItem(TOKEN_KEY, decodeURIComponent(match[1]));
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, document.title, url.toString());
  }
})();

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// A flaky mobile connection can leave a fetch() neither resolving nor
// rejecting for a long time (the browser is still waiting on a stalled
// socket). Without a cap, that hangs whatever awaited it forever — e.g. the
// background sync engine's "Синхронизиране..." indicator never clears,
// because its own try/catch/finally never gets to run. 12s is still
// generous for a slow mobile network, but short enough that a single bad
// request doesn't make the whole sync (which makes several requests) feel
// like it hung for a very long time.
const REQUEST_TIMEOUT_MS = 12000;

async function apiFetch(path, { method = "GET", body, headers, raw, timeoutMs } = {}) {
  const token = getToken();
  const finalHeaders = { ...headers };
  let finalBody = body;
  if (body !== undefined && !raw) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Request timed out");
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function makeEntityClient(entityName) {
  return {
    list: (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.set("sort", sort);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return apiFetch(`/api/entities/${entityName}${qs ? `?${qs}` : ""}`);
    },
    filter: (criteria = {}) =>
      apiFetch(`/api/entities/${entityName}/filter`, { method: "POST", body: criteria }),
    get: (id) => apiFetch(`/api/entities/${entityName}/${id}`),
    create: (data) => apiFetch(`/api/entities/${entityName}`, { method: "POST", body: data }),
    update: (id, data) => apiFetch(`/api/entities/${entityName}/${id}`, { method: "PUT", body: data }),
    delete: (id) => apiFetch(`/api/entities/${entityName}/${id}`, { method: "DELETE" }),
    bulkCreate: (records) =>
      apiFetch(`/api/entities/${entityName}/bulk-create`, { method: "POST", body: { records } }),
    bulkUpdate: (records) =>
      apiFetch(`/api/entities/${entityName}/bulk-update`, { method: "PUT", body: { records } }),
  };
}

// Lazily builds an entities.<Name> client for any name accessed — new
// entities added to server/schema/entities.generated.ts work automatically,
// no change needed here.
const entities = new Proxy(
  {},
  { get: (_target, name) => makeEntityClient(String(name)) },
);

// Photos are stored directly in Postgres (server/routes/catchPhotos.ts) —
// compressed client-side to ~400-500KB first (src/lib/imageCompression.js)
// so a free-tier database can hold a large number of catches. No external
// object storage (S3/R2/etc.) or paid service is involved.
async function uploadFile(file) {
  const data = await apiFetch(`/api/catch-photos`, {
    method: "POST",
    raw: true,
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  return { file_url: data.file_url };
}

export const base44 = {
  entities,
  // The original SDK's `asServiceRole` bypassed row-level security; here an
  // admin account already gets that same full access on every normal
  // endpoint (see server/middleware/authorize.ts), so this is just an alias.
  asServiceRole: { entities },

  auth: {
    isAuthenticated: async () => {
      if (!getToken()) return false;
      try {
        await apiFetch("/api/auth/me");
        return true;
      } catch {
        return false;
      }
    },
    me: () => apiFetch("/api/auth/me"),
    updateMe: (patch) => apiFetch("/api/auth/me", { method: "PUT", body: patch }),
    loginViaEmailPassword: async (email, password) => {
      const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
      setToken(data.access_token);
      return data;
    },
    loginWithProvider: (provider, returnTo) => {
      if (provider !== "google") throw new Error(`Unsupported provider: ${provider}`);
      const params = new URLSearchParams({ returnTo: returnTo || "/" });
      window.location.href = `${API_BASE}/api/auth/google?${params.toString()}`;
    },
    register: (payload) => apiFetch("/api/auth/register", { method: "POST", body: payload }),
    verifyOtp: (payload) => apiFetch("/api/auth/verify-otp", { method: "POST", body: payload }),
    resendOtp: (email) => apiFetch("/api/auth/resend-otp", { method: "POST", body: { email } }),
    resetPasswordRequest: (email) =>
      apiFetch("/api/auth/reset-password-request", { method: "POST", body: { email } }),
    resetPassword: (payload) => apiFetch("/api/auth/reset-password", { method: "POST", body: payload }),
    setToken,
    logout: (redirectUrl) => {
      setToken(null);
      if (redirectUrl) window.location.href = redirectUrl;
    },
    redirectToLogin: (returnTo) => {
      const params = new URLSearchParams({ returnTo: returnTo || "/" });
      window.location.href = `/login?${params.toString()}`;
    },
  },

  functions: {
    invoke: (name, payload) => apiFetch(`/api/functions/${name}`, { method: "POST", body: payload }),
  },

  integrations: {
    Core: {
      UploadFile: ({ file }) => uploadFile(file),
      UploadPublicFile: ({ file }) => uploadFile(file),
      SendEmail: (payload) => apiFetch("/api/integrations/send-email", { method: "POST", body: payload }),
      InvokeLLM: (payload) => apiFetch("/api/integrations/invoke-llm", { method: "POST", body: payload }),
    },
  },

  users: {
    inviteUser: (email, role) => apiFetch("/api/auth/invite", { method: "POST", body: { email, role } }),
  },

  // Not part of the original base44 SDK surface — powers the in-app Setup
  // Wizard (Admin → Setup) for optional integrations (Google OAuth, photo
  // storage, email, Stripe, LLM).
  admin: {
    getSettingsStatus: () => apiFetch("/api/admin/settings"),
    updateSettings: (patch) => apiFetch("/api/admin/settings", { method: "PUT", body: patch }),
    // Sends a real test email through the currently saved SMTP settings —
    // powers the "Изпрати тестов имейл" button in the SMTP section of the
    // Setup Wizard (AdminSetup.jsx).
    sendTestEmail: (to) => apiFetch("/api/admin/settings/test-email", { method: "POST", body: { to } }),

    // Full-database backup/restore — powers the "Глобален експорт/импорт"
    // buttons in AdminDataExport.jsx (see src/lib/globalBackup.js for the
    // zip assembly and the batching that keeps every request/response under
    // Vercel's 4.5MB body limit). Admin-only; see server/routes/adminBackup.ts.
    //
    // A longer client-side timeout than the default 12s: some of these calls
    // (a full table dump, a multi-row restore) can legitimately take longer
    // than a normal UI request. server/router.ts already caps any single
    // request at 20s server-side and returns a clean, friendly error if it's
    // exceeded — this just needs to stay a bit above that so the browser
    // doesn't abort first and hide that better error behind a generic
    // "Request timed out".
    backup: {
      manifest: () => apiFetch("/api/admin/backup/manifest", { timeoutMs: 25000 }),
      table: (name) => apiFetch(`/api/admin/backup/table/${name}`, { timeoutMs: 25000 }),
      photosList: () => apiFetch("/api/admin/backup/photos-list", { timeoutMs: 25000 }),
      restoreBegin: () => apiFetch("/api/admin/backup/restore/begin", { method: "POST", timeoutMs: 25000 }),
      restoreTable: (name, rows) =>
        apiFetch(`/api/admin/backup/restore/table/${name}`, { method: "POST", body: { rows }, timeoutMs: 25000 }),
      restorePhotos: (photos) =>
        apiFetch("/api/admin/backup/restore/photos", { method: "POST", body: { photos }, timeoutMs: 25000 }),
      // "Осиротели" снимки — catch_photos rows nothing references anymore
      // (a replaced or deleted catch's old photo). New replacements/deletes
      // clean up after themselves automatically now (see entities.ts); this
      // is for the backlog from before that existed. See server/lib/photoGc.ts.
      orphanedPhotosCount: () => apiFetch("/api/admin/backup/orphaned-photos", { timeoutMs: 25000 }),
      cleanupOrphanedPhotos: () =>
        apiFetch("/api/admin/backup/orphaned-photos/cleanup", { method: "POST", timeoutMs: 25000 }),
      // Some older catch_photos URLs got stamped with a misspelled host
      // ("cath-counter" instead of "catch-counter") — see
      // server/routes/adminBackup.ts's wrong-domain-photo-urls handler.
      // Re-derives the correct URL from each photo's own id.
      wrongDomainPhotoUrlsCount: () => apiFetch("/api/admin/backup/wrong-domain-photo-urls", { timeoutMs: 25000 }),
      fixWrongDomainPhotoUrls: () =>
        apiFetch("/api/admin/backup/wrong-domain-photo-urls/fix", { method: "POST", timeoutMs: 25000 }),
    },

    // v2.77 — admin-only "reassign which registered user owns this water
    // body / venue" action, from the Търговци admin screen. Not a generic
    // entity field (created_by_id is deliberately excluded from every
    // entity's writable columns, see server/routes/entities.ts's
    // sanitizePayload comment), so it needs its own small endpoint — see
    // server/routes/adminMerchants.ts.
    merchants: {
      reassignOwner: (type, id, newOwnerId) =>
        apiFetch(`/api/admin/merchants/${type}/${id}`, { method: "PATCH", body: { created_by_id: newOwnerId } }),
    },
  },

  // Public (no admin rights needed) — how to pay the platform owner, for
  // pages like Advertise.jsx that need to show this to any visitor.
  settings: {
    getPaymentInfo: () => apiFetch("/api/settings/payment"),
    // v2.68 — whether Google AdSense fallback ads are configured/enabled;
    // used by AdSenseLoader.jsx to decide whether to load the script at all.
    getAdSenseInfo: () => apiFetch("/api/settings/adsense"),
    // v2.88 — admin-configurable display order of the nav menu; read by
    // EVERY user's own Layout.jsx (see src/lib/menuOrder.js). Saving it is
    // admin-only, through admin.updateSettings({ MENU_ORDER: ... }) below.
    getMenuOrder: () => apiFetch("/api/settings/menu-order"),
  },

  // v2.90 — "assign this registration to a real system account" (organizer's
  // participant-edit dialog, WaterBodyManagement.jsx). NOT under `admin` —
  // the competition's organizer (not just an admin) is allowed to call this
  // too, see server/routes/competitionRegistrations.ts.
  competitionRegistrations: {
    reassign: (id, email) =>
      apiFetch(`/api/competition-registrations/${id}/reassign`, { method: "POST", body: { email } }),
  },

  // v2.68 — QR referral/sharing system (Табло → "Покани приятел"). See
  // server/routes/referrals.ts.
  referrals: {
    redeem: (code) => apiFetch("/api/referrals/redeem", { method: "POST", body: { code } }),
    stats: () => apiFetch("/api/referrals/stats"),
  },

  // v2.69 — "Търговци" printed-brochure QR codes (water bodies + commercial
  // venues). See server/routes/merchantReferrals.ts.
  merchantReferrals: {
    redeem: (code) => apiFetch("/api/merchant-referrals/redeem", { method: "POST", body: { code } }),
    stats: (type, id) => apiFetch(`/api/merchant-referrals/stats?type=${type}&id=${id}`),
  },

  // v2.97 — "Връзка с нас" (Contact Us). See server/routes/contact.ts.
  contact: {
    send: (email, phone, message) =>
      apiFetch("/api/contact", { method: "POST", body: { email, phone, message } }),
  },

  // Not part of the original base44 SDK surface — admin-only "apply the
  // latest database update" buttons (Admin → Настройка → База данни),
  // powered by server/routes/adminMigrations.ts. See that file for why this
  // exists instead of asking the admin to run a terminal command.
  migrations: {
    status: () => apiFetch("/api/admin/migrations"),
    apply: (id) => apiFetch(`/api/admin/migrations/${id}`, { method: "POST" }),
  },

  catchPhotos: {
    // Best-effort cleanup for a single photo — deletes it ONLY if nothing
    // references it anywhere (see server/lib/photoGc.ts), so it's always
    // safe to call speculatively. Used by catchRepository.js when a catch
    // that was never synced to the server (still a "local_..." id) gets
    // deleted locally after its photo already made it to the cloud.
    gcIfOrphaned: (id) => apiFetch(`/api/catch-photos/${id}`, { method: "DELETE" }),
  },
};
