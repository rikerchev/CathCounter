import { sql } from "../db.js";
import { verifyToken } from "../lib/jwt.js";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  // v3.03 — the registering/registered user's own phone number, so an
  // organizer always has a direct-contact option (see routes/auth.ts's
  // "register" action and Register.jsx). null on accounts created before
  // this existed, or while the migration below hasn't been applied yet.
  phone: string | null;
  role: "user" | "admin" | "water_owner" | "advertiser";
  roles: string[];
  country: string | null;
  menu_group_id: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  // v2.68 — QR referral system: null until the account has ever earned
  // referral-based ad-free premium; see routes/referrals.ts.
  premium_until: string | null;
  // v2.98 — null until the account has accepted the Terms & Conditions at
  // least once; App.jsx blocks the whole app behind TermsGate.jsx until this
  // is set. See routes/auth.ts's "accept-terms" action.
  terms_accepted_at: string | null;
  // v3.05 — true only while the v3.03-user-phone migration hasn't been
  // applied yet, so App.jsx's PhoneGate.jsx can tell "no column yet" (don't
  // gate — nobody could save a phone anyway, admin included) apart from
  // "column exists but this account has no phone" (do gate). Deliberately
  // NOT a sentinel string on `phone` itself (unlike terms_accepted_at's
  // "pending-migration") — that would show up as literal text in
  // Profile.jsx's phone field.
  phone_migration_pending?: boolean;
}

const BASE_USER_COLUMNS = [
  "id", "email", "full_name", "role", "roles", "country", "menu_group_id",
  "email_verified", "created_at", "updated_at",
];

// Columns whose code (git push, automatic on Vercel) and schema change
// (Admin → Настройка → База данни, a manual click — see adminMigrations.ts)
// deploy as two separate steps. Selecting one of these can 500 for a window
// after the code deploys until the admin applies its migration; each is
// probed independently below (rather than falling back to ALL-or-nothing)
// so e.g. a pending v3.03 (phone) migration doesn't also blank out an
// already-applied v2.98 (terms_accepted_at) for every request in that gap.
const OPTIONAL_USER_COLUMNS = ["premium_until", "terms_accepted_at", "phone"] as const;
type OptionalUserColumn = (typeof OPTIONAL_USER_COLUMNS)[number];

function defaultForMissing(col: OptionalUserColumn): string | null {
  // Non-null sentinel for terms_accepted_at specifically: with the column
  // not migrated yet, `null` would force EVERY account through TermsGate.jsx
  // the instant this code deploys, well before the admin has had a chance to
  // click "Приложи обновление" — worse than just not enforcing acceptance yet.
  return col === "terms_accepted_at" ? "pending-migration" : null;
}

async function selectUser(id: string, skip: OptionalUserColumn[]): Promise<AuthUser | null> {
  const columns = [...BASE_USER_COLUMNS, ...OPTIONAL_USER_COLUMNS.filter((c) => !skip.includes(c))];
  try {
    const rows = await sql.unsafe<AuthUser[]>(
      `SELECT ${columns.join(", ")} FROM users WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const result = { ...row } as AuthUser;
    for (const c of skip) {
      (result as unknown as Record<string, unknown>)[c] = defaultForMissing(c);
      if (c === "phone") result.phone_migration_pending = true;
    }
    return result;
  } catch (e) {
    // Postgres reports one missing column per error — recurse, dropping
    // exactly that column from the next attempt, until the select succeeds
    // or the error is something else entirely (rethrown as-is).
    const missing = OPTIONAL_USER_COLUMNS.find(
      (c) => !skip.includes(c) && e instanceof Error && new RegExp(c).test(e.message),
    );
    if (missing) return selectUser(id, [...skip, missing]);
    throw e;
  }
}

/**
 * Reads the user fresh from the DB on every request (rather than trusting
 * the JWT's embedded role) so a role change or ban takes effect immediately
 * instead of waiting for the token to expire.
 */
export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization") || "";
  const [, token] = header.match(/^Bearer (.+)$/) || [];
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return selectUser(payload.sub, []);
}

// `role` (singular, legacy/primary) and `roles` (array, supports someone
// being e.g. both water_owner and advertiser) can both grant admin — this is
// the one place that checks both, everywhere else should call this instead
// of comparing `user.role === "admin"` directly.
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin" || (user?.roles ?? []).includes("admin");
}
