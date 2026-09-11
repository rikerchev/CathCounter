import { sql } from "../db.ts";
import { env } from "../env.ts";

// Every key that can be set through the Setup Wizard instead of server/.env.
// DATABASE_URL, JWT_SECRET, PORT, and PUBLIC_APP_URL are deliberately absent —
// you need a working DB connection before this table is even readable, so
// those four have to stay real environment variables.
export const SETTINGS_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_PUBLIC_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "S3_PUBLIC_BASE_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export type SettingKey = typeof SETTINGS_KEYS[number];

// Never echo these back to the client once saved — the wizard shows
// "configured ✓" and lets you overwrite, not view, the current value.
const SECRET_KEYS = new Set<SettingKey>([
  "GOOGLE_CLIENT_SECRET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "LLM_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

let cache: Map<string, string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 15_000;

async function loadCache(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await sql<{ key: string; value: string }[]>`SELECT key, value FROM app_settings`;
  cache = new Map(rows.map((r) => [r.key, r.value]));
  cacheLoadedAt = Date.now();
  return cache;
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
