import { sql } from "../db.js";
import { env } from "../env.js";

// Every key that can be set through the Setup Wizard instead of server/.env.
// DATABASE_URL, JWT_SECRET, PORT, and PUBLIC_APP_URL are deliberately absent —
// you need a working DB connection before this table is even readable, so
// those four have to stay real environment variables.
export const SETTINGS_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
  "LLM_PROVIDER",
  "LLM_API_KEY",
  // How advertisers/renters actually pay the platform owner — surfaced
  // read-only to any user via GET /api/settings/payment (see
  // routes/publicSettings.ts), configured here via the Setup Wizard.
  "PAYMENT_REVOLUT_ENABLED",
  "PAYMENT_REVOLUT_TAG",
  "PAYMENT_REVOLUT_URL",
  "PAYMENT_BANK_ENABLED",
  "PAYMENT_BANK_HOLDER",
  "PAYMENT_BANK_IBAN",
  "PAYMENT_BANK_BIC",
  "PAYMENT_INSTRUCTIONS_NOTE",
  // S3-compatible object storage (Supabase Storage, Cloudflare R2, Backblaze
  // B2, or real AWS S3 — see server/lib/s3.ts) for generic file uploads
  // (e.g. ad logos, src/pages/CustomAds.jsx). Added v2.47: these keys were
  // already read by s3.ts/uploads.ts but were never actually listed here,
  // so there was no way to configure them through the wizard (or save them
  // at all) — uploads have been failing with "Object storage is not
  // configured yet" until now. Catch photos are unaffected: they go
  // straight into the database (BYTEA), not through this.
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_PUBLIC_BUCKET",
  "S3_PUBLIC_BASE_URL",
  "S3_FORCE_PATH_STYLE",
  // Google AdSense fallback ads (v2.68) — only ever fills a placement that
  // would otherwise show the empty/"advertise here" placeholder (see
  // useEligibleAds.js); never displaces a real CustomAd or a rented AdSlot.
  // Left unconfigured/disabled until the admin has their own approved
  // AdSense account and pastes in their publisher ID — see
  // routes/publicSettings.ts's /api/settings/adsense for how the (non-secret)
  // publisher ID reaches the client.
  "ADSENSE_ENABLED",
  "ADSENSE_PUBLISHER_ID",
] as const;

export type SettingKey = typeof SETTINGS_KEYS[number];

// Never echo these back to the client once saved — the wizard shows
// "configured ✓" and lets you overwrite, not view, the current value.
const SECRET_KEYS = new Set<SettingKey>([
  "GOOGLE_CLIENT_SECRET",
  "SMTP_PASSWORD",
  "LLM_API_KEY",
  "S3_SECRET_ACCESS_KEY",
]);

let cache: Map<string, string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 15_000;
// sendEmail() reads 6 keys via Promise.all — with a cold/expired cache that
// used to fire 6 near-simultaneous, near-identical `SELECT * FROM
// app_settings` queries on the single shared DB connection. That was one of
// the things that could push a slow connection over the edge (and, worse,
// made a timeout on any one of them take out the others too — see the
// comment in db.ts). Reusing a single in-flight load for all concurrent
// callers means only one query ever goes out at a time.
let loadingPromise: Promise<Map<string, string>> | null = null;

async function loadCache(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const rows = await sql<{ key: string; value: string }[]>`SELECT key, value FROM app_settings`;
    cache = new Map(rows.map((r) => [r.key, r.value]));
    cacheLoadedAt = Date.now();
    return cache;
  })();
  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

function isSettingKey(key: string): key is SettingKey {
  return (SETTINGS_KEYS as readonly string[]).includes(key);
}

/**
 * Resolves a config value: DB override (set via the wizard) takes priority,
 * falling back to server/.env so local dev without the wizard still works.
 */
export async function getConfig(key: SettingKey): Promise<string> {
  const c = await loadCache();
  const dbValue = c.get(key);
  if (dbValue) return dbValue;
  return (env as unknown as Record<string, string>)[key] ?? "";
}

export async function setSettings(patch: Record<string, string>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => isSettingKey(k));
  for (const [key, value] of entries) {
    if (value === "") {
      await sql`DELETE FROM app_settings WHERE key = ${key}`;
    } else {
      await sql`
        INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${value}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    }
  }
  cache = null; // force a reload on next read so changes apply without a restart
}

export interface SettingStatus {
  configured: boolean;
  value: string | null; // null for secrets — never sent to the client
  secret: boolean;
}

export async function getSettingsStatus(): Promise<Record<SettingKey, SettingStatus>> {
  const c = await loadCache();
  const out = {} as Record<SettingKey, SettingStatus>;
  for (const key of SETTINGS_KEYS) {
    const dbValue = c.get(key);
    const envValue = (env as unknown as Record<string, string>)[key] ?? "";
    const value = dbValue ?? envValue;
    const secret = SECRET_KEYS.has(key);
    out[key] = {
      configured: Boolean(value),
      value: secret ? null : (value || null),
      secret,
    };
  }
  return out;
}

export interface PaymentInfo {
  revolut: { enabled: boolean; tag: string; url: string };
  bank: { enabled: boolean; holder: string; iban: string; bic: string };
  note: string;
}

/**
 * Read-only, non-admin view of the payment settings — used by any page that
 * needs to tell a user how to pay the platform owner (e.g. Advertise.jsx).
 * None of these fields are secrets, so it's fine to expose them to any
 * authenticated (or anonymous) caller via a public route.
 */
export async function getPaymentInfo(): Promise<PaymentInfo> {
  const [revEnabled, revTag, revUrl, bankEnabled, bankHolder, bankIban, bankBic, note] = await Promise.all([
    getConfig("PAYMENT_REVOLUT_ENABLED"),
    getConfig("PAYMENT_REVOLUT_TAG"),
    getConfig("PAYMENT_REVOLUT_URL"),
    getConfig("PAYMENT_BANK_ENABLED"),
    getConfig("PAYMENT_BANK_HOLDER"),
    getConfig("PAYMENT_BANK_IBAN"),
    getConfig("PAYMENT_BANK_BIC"),
    getConfig("PAYMENT_INSTRUCTIONS_NOTE"),
  ]);
  return {
    revolut: { enabled: revEnabled === "true" && Boolean(revTag || revUrl), tag: revTag, url: revUrl },
    bank: { enabled: bankEnabled === "true" && Boolean(bankIban), holder: bankHolder, iban: bankIban, bic: bankBic },
    note,
  };
}

export interface AdSenseInfo {
  enabled: boolean;
  publisherId: string | null;
}

// Read-only, non-admin view (the publisher ID is not a secret — it ends up
// in the page's own HTML/script tag the moment AdSense is on, same as any
// site running it) — used by the frontend to decide whether to load the
// AdSense script at all. See routes/publicSettings.ts.
export async function getAdSenseInfo(): Promise<AdSenseInfo> {
  const [enabled, publisherId] = await Promise.all([
    getConfig("ADSENSE_ENABLED"),
    getConfig("ADSENSE_PUBLISHER_ID"),
  ]);
  return {
    enabled: enabled === "true" && Boolean(publisherId),
    publisherId: publisherId || null,
  };
}
