import { sql } from "../db.js";
import { verifyToken } from "../lib/jwt.js";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
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

  try {
    const rows = await sql<AuthUser[]>`
      SELECT id, email, full_name, role, roles, country, menu_group_id, email_verified,
             created_at, updated_at, premium_until, terms_accepted_at
      FROM users WHERE id = ${payload.sub}
    `;
    return rows[0] ?? null;
  } catch (e) {
    // v2.68/v2.98 each deploy their code (auto, on git push) and their own
    // new column (manual, via the Admin → Настройка → База данни button) as
    // two separate steps — this SELECT would otherwise 500 on EVERY request
    // in the gap between them. Fall back column-by-column so the whole app
    // doesn't go down just because a button hasn't been clicked yet; each
    // missing column simply reads as null until it has been added.
    if (e instanceof Error && /terms_accepted_at/.test(e.message)) {
      try {
        const rows = await sql<Omit<AuthUser, "terms_accepted_at">[]>`
          SELECT id, email, full_name, role, roles, country, menu_group_id, email_verified,
                 created_at, updated_at, premium_until
          FROM users WHERE id = ${payload.sub}
        `;
        // terms_accepted_at reads as a non-null placeholder (not `null`) here
        // on purpose: with the column not migrated yet, EVERY account would
        // otherwise be forced through TermsGate.jsx the instant the code
        // deploys, well before the admin has had a chance to click "Приложи
        // обновление" — worse than just not enforcing acceptance yet.
        return rows[0] ? { ...rows[0], terms_accepted_at: "pending-migration" } : null;
      } catch (e2) {
        if (e2 instanceof Error && /premium_until/.test(e2.message)) {
          const rows = await sql<Omit<AuthUser, "premium_until" | "terms_accepted_at">[]>`
            SELECT id, email, full_name, role, roles, country, menu_group_id, email_verified,
                   created_at, updated_at
            FROM users WHERE id = ${payload.sub}
          `;
          return rows[0] ? { ...rows[0], premium_until: null, terms_accepted_at: "pending-migration" } : null;
        }
        throw e2;
      }
    }
    if (e instanceof Error && /premium_until/.test(e.message)) {
      const rows = await sql<Omit<AuthUser, "premium_until">[]>`
        SELECT id, email, full_name, role, roles, country, menu_group_id, email_verified,
               created_at, updated_at, terms_accepted_at
        FROM users WHERE id = ${payload.sub}
      `;
      return rows[0] ? { ...rows[0], premium_until: null } : null;
    }
    throw e;
  }
}

// `role` (singular, legacy/primary) and `roles` (array, supports someone
// being e.g. both water_owner and advertiser) can both grant admin — this is
// the one place that checks both, everywhere else should call this instead
// of comparing `user.role === "admin"` directly.
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin" || (user?.roles ?? []).includes("admin");
}
