import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// How much ad-free time each side of a successful invite earns, and the
// cumulative cap on it (v2.68 — user chose "Таван 60 дни" over unlimited
// stacking). Both constants are intentionally private to this file: nothing
// else needs to know the numbers, only that redeeming grants *some* bonus.
const BONUS_DAYS = 7;
const CAP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// Redemption only counts for a genuinely NEW signup — without this, an
// existing user could revisit a friend's invite link at any later point
// (the code sits in their browser's sessionStorage until used, see
// src/lib/referral.js) and farm the bonus over and over on old, unrelated
// accounts. 24h comfortably covers the slower email/OTP signup path as well
// as an immediate Google sign-in.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Adds BONUS_DAYS to a user's premium_until (from "now" if they had none, or
// weren't already premium), capped so the result is never more than
// CAP_DAYS out from now — i.e. the cap is on how far into the future your
// premium can reach, not on how many invites you can send.
async function grantBonus(userId: string): Promise<string> {
  const rows = await sql<{ premium_until: string | null }[]>`
    SELECT premium_until FROM users WHERE id = ${userId}
  `;
  const now = Date.now();
  const current = rows[0]?.premium_until ? new Date(rows[0].premium_until).getTime() : 0;
  const base = current > now ? current : now;
  const next = Math.min(base + BONUS_DAYS * DAY_MS, now + CAP_DAYS * DAY_MS);
  const nextIso = new Date(next).toISOString();
  await sql`UPDATE users SET premium_until = ${nextIso}, updated_at = now() WHERE id = ${userId}`;
  return nextIso;
}

/**
 * POST /api/referrals/redeem { code }   (authenticated)
 *   code = the referrer's own user id, taken from the ?ref= link/QR shown
 *   on their Табло (see src/pages/Home.jsx, src/lib/referral.js). Grants
 *   BONUS_DAYS of ad-free premium to BOTH accounts, each capped at CAP_DAYS
 *   out from now. One-time per referred account (referrals.referred_id is
 *   UNIQUE) and only within NEW_ACCOUNT_WINDOW_MS of that account's
 *   creation — see the comment on that constant above.
 *
 * GET /api/referrals/stats   (authenticated)
 *   -> { referral_count, premium_until } for the "Покани приятел" card.
 */
export async function handleReferralsRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  const [action] = path;

  if (action === "redeem" && req.method === "POST") {
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) return json({ error: "Липсва код за покана" }, 400);
    if (code === user.id) return json({ error: "Не можете да използвате собствената си покана" }, 400);

    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    if (accountAgeMs > NEW_ACCOUNT_WINDOW_MS) {
      return json({ error: "Поканите важат само за нова регистрация" }, 400);
    }

    const referrer = await sql<{ id: string }[]>`SELECT id FROM users WHERE id = ${code}`;
    if (!referrer.length) return json({ error: "Невалиден код за покана" }, 400);

    const already = await sql`SELECT id FROM referrals WHERE referred_id = ${user.id}`;
    if (already.length) return json({ error: "Вече сте използвали покана" }, 409);

    try {
      await sql`INSERT INTO referrals (referrer_id, referred_id) VALUES (${code}, ${user.id})`;
    } catch {
      // Unique/check constraint race (two near-simultaneous redeem calls,
      // or a self-referral that slipped past the id check above somehow) —
      // treat identically to "already used", never a 500.
      return json({ error: "Невалидна или вече използвана покана" }, 409);
    }

    const referredUntil = await grantBonus(user.id);
    await grantBonus(code);

    return json({ success: true, premium_until: referredUntil, bonus_days: BONUS_DAYS });
  }

  if (action === "stats" && req.method === "GET") {
    if (!user) return json({ error: "Not authenticated" }, 401);
    const rows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_id = ${user.id}
    `;
    return json({ referral_count: rows[0]?.count ?? 0, premium_until: user.premium_until });
  }

  return json({ error: "Not found" }, 404);
}
