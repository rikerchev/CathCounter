import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../db.js";
import { env } from "../env.js";
import { COUNTRY_LANGUAGE } from "./competitionMailText.js";

// v3.165 — "Известия за състезания": every user may switch the announcement
// e-mails / in-app notices for new competitions off, either in Профил or with
// the unsubscribe link at the bottom of the e-mail itself. The preference is
// users.notify_competitions (NULL / TRUE = receives, FALSE = does not). The
// column is added on demand (the same harmless statement as the v3.165
// migration), so nothing breaks if the migration was never clicked.

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`unsub-competitions:${userId}`)
    .digest("hex")
    .slice(0, 40);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(userId: string, lang = "en"): string {
  const base = env.PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/api/auth/unsubscribe-competitions?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}&l=${encodeURIComponent(lang)}`;
}

let columnEnsured = false;

/**
 * Adds the columns this feature needs when they are missing:
 * users.notify_competitions (the opt-out), users.last_country (country of the
 * last app start, from the IP — see userActivity.ts) and users.language.
 * Returns true when usable.
 */
export async function ensureNotifyColumn(): Promise<boolean> {
  if (columnEnsured) return true;
  try {
    await sql.unsafe(
      `ALTER TABLE users
         ADD COLUMN IF NOT EXISTS notify_competitions BOOLEAN NOT NULL DEFAULT TRUE,
         ADD COLUMN IF NOT EXISTS last_country TEXT,
         ADD COLUMN IF NOT EXISTS language TEXT`,
    );
    columnEnsured = true;
    return true;
  } catch (e) {
    console.error("users.notify_competitions / last_country could not be added:", e);
    return false;
  }
}

export function isMissingNotifyColumn(e: unknown): boolean {
  return e instanceof Error && /notify_competitions|last_country|language/.test(e.message);
}

// SQL: the user's country = the one they set themselves (users.country, rarely
// used) else the one seen from their IP at the last app start.
const USER_COUNTRY_SQL = `UPPER(COALESCE(NULLIF(country, ''), NULLIF(last_country, '')))`;

/**
 * Country of whoever organizes: the water body's country, otherwise the
 * country of the account that created the water body / competition.
 * Returns an upper-case ISO code or "" when it cannot be told.
 */
export async function organizerCountry(
  waterBody: { country?: string | null; created_by_id?: string | null } | null,
  competition: { created_by_id?: string | null },
): Promise<string> {
  const direct = (waterBody?.country || "").trim().toUpperCase();
  if (direct) return direct;
  for (const uid of [waterBody?.created_by_id, competition.created_by_id]) {
    if (!uid) continue;
    try {
      const rows = await sql.unsafe<{ c: string | null }[]>(
        `SELECT ${USER_COUNTRY_SQL} AS c FROM users WHERE id = $1`,
        [uid],
      );
      if (rows[0]?.c) return rows[0].c;
    } catch {
      /* columns not there yet — treat as unknown */
    }
  }
  return "";
}

export interface Recipient {
  id: string;
  email: string;
  language: string | null;
  user_country: string | null;
}

/**
 * v3.166 — regional recipients of a competition announcement: users who have
 * not switched the notifications off AND
 *   • are in the organizer's country (users.country, else the IP country of
 *     their last app start), or
 *   • have no known country at all but use the app in the organizer country's
 *     language (never for English — that would be everyone).
 * Someone known to be in another country is never included, whatever their
 * app language. An unknown organizer country reaches nobody.
 */
export async function selectCompetitionRecipients(country: string): Promise<Recipient[]> {
  const cc = (country || "").trim().toUpperCase();
  if (!cc) return [];
  const lang = COUNTRY_LANGUAGE[cc];
  const useLang = lang && lang !== "en" ? lang : "";
  const run = () =>
    sql.unsafe<Recipient[]>(
      `SELECT id, email, language, ${USER_COUNTRY_SQL} AS user_country
         FROM users
        WHERE notify_competitions IS NOT FALSE
          AND (
            ${USER_COUNTRY_SQL} = $1
            ${useLang ? `OR (${USER_COUNTRY_SQL} IS NULL AND language = $2)` : ""}
          )`,
      useLang ? [cc, useLang] : [cc],
    );
  try {
    return await run();
  } catch (e) {
    if (!isMissingNotifyColumn(e)) throw e;
    // Columns not there yet → nobody has a country/opt-out; create, retry.
    if (!(await ensureNotifyColumn())) return [];
    return await run();
  }
}

/** Sets the preference; creates the column on demand. */
export async function setNotifyCompetitions(userId: string, value: boolean): Promise<void> {
  const run = () => sql`UPDATE users SET notify_competitions = ${value} WHERE id = ${userId}`;
  try {
    await run();
  } catch (e) {
    if (!isMissingNotifyColumn(e)) throw e;
    await ensureNotifyColumn();
    await run();
  }
}
