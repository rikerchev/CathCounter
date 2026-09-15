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
             created_at, updated_at, premium_until
      FROM users WHERE id = ${payload.sub}
    `;
    return rows[0] ?? null;
  } catch (e) {
    // v2.68 deploys the code (auto, on git push) and the `premium_until`
    // column (manual, via the Admin → Настройка → База данни button) as two
    // separate steps — this SELECT would otherwise 500 on EVERY request in
    // the gap between them. Fall back to the pre-v2.68 column list so the
    // whole app doesn't go down just because the button hasn't been clicked
    // yet; premium_until simply reads as null (= not premium) until it has.
    if (e instanceof Error && /premium_until/.test(e.message)) {
      const rows = await sql<Omit<AuthUser, "premium_until">[]>`
        SELECT id, email, full_name, role, roles, country, menu_group_id, email_verified,
               created_at, updated_at
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
