import { sql } from "../db.js";

// v3.163 — when a user last signed in (last_login_at) and when the app was last
// opened with a valid session (last_seen_at). Shown in Admin → Управление на
// потребители, to plan reminder e-mails. Both are best-effort: a failure here
// must never break a login or the start-up of the app.
//
// last_login_at is only set by a real sign-in (password, e-mail code, Google,
// registration). The session token lives for a long time, so most visits are
// not sign-ins — last_seen_at is refreshed by GET /api/auth/me (every app
// start), at most once per 30 minutes per account.
//
// The columns are added on first use if the admin hasn't applied the
// "v3.163" migration yet (same harmless statement the migration runs).
const COLUMN_RE = /last_login_at|last_seen_at|last_country/;

async function ensureColumns(): Promise<void> {
  await sql.unsafe(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS last_country TEXT`,
  );
}

async function runWithColumnRetry(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    if (e instanceof Error && COLUMN_RE.test(e.message)) {
      try {
        await ensureColumns();
        await run();
      } catch (e2) {
        console.error("user activity could not be recorded:", e2);
      }
      return;
    }
    console.error("user activity could not be recorded:", e);
  }
}

// v3.166 — country (ISO code) the request came from, taken from the host's own
// geo header (Vercel). Stored as users.last_country so new-competition
// announcements can be limited to the organizer's country. Only the 2-letter
// code is kept, never the IP address. null when unknown.
export function ipCountry(req: Request): string | null {
  const c = (req.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export async function recordLogin(userId: string, country: string | null = null): Promise<void> {
  await runWithColumnRetry(
    () => country
      ? sql`UPDATE users SET last_login_at = now(), last_seen_at = now(), last_country = ${country} WHERE id = ${userId}`
      : sql`UPDATE users SET last_login_at = now(), last_seen_at = now() WHERE id = ${userId}`,
  );
}

export async function touchLastSeen(userId: string, country: string | null = null): Promise<void> {
  await runWithColumnRetry(
    () => country
      ? sql`
          UPDATE users SET last_seen_at = now(), last_country = ${country}
          WHERE id = ${userId}
            AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 minutes'
                 OR last_country IS DISTINCT FROM ${country})
        `
      : sql`
          UPDATE users SET last_seen_at = now()
          WHERE id = ${userId}
            AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 minutes')
        `,
  );
}
