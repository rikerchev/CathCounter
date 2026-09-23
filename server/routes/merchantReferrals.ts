import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Same "only a genuinely new signup counts" guard as the peer QR system
// (server/routes/referrals.ts) — see that file's comment on the equivalent
// constant for why.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

const MERCHANT_TABLES: Record<string, string> = {
  water_body: "water_bodies",
  venue: "venues",
};

function parseCode(code: string): { type: string; id: string } | null {
  const i = code.indexOf(":");
  if (i === -1) return null;
  const type = code.slice(0, i);
  const id = code.slice(i + 1);
  if (!MERCHANT_TABLES[type] || !id) return null;
  return { type, id };
}

// custom_ads.expires_at is a plain "YYYY-MM-DD" string, computed and owned
// client-side (see entities.generated.ts's comment on that column) — this
// only ever EXTENDS it by whole days, never recomputes it from
// starts_at/duration_months, so it doesn't need to know that billing logic.
function addDaysToDateString(dateStr: string | null, days: number): string {
  const base = dateStr && !isNaN(Date.parse(dateStr)) ? new Date(dateStr) : new Date();
  const start = base.getTime() > Date.now() ? base : new Date();
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

// v3.30 — weight floor/ceiling for the proportional merchant-banner
// rotation below: every attached merchant gets at least MIN_SHARE of the
// rotation cycle even with 0 referrals (so nobody an admin explicitly
// attached ever goes fully invisible), plus one extra share per QR-code
// registration, capped at MAX_SHARE so one very successful merchant can't
// swallow the whole rotation and make the others effectively invisible.
const MIN_SHARE = 1;
const MAX_SHARE = 20;

/**
 * POST /api/merchant-referrals/redeem { code }   (authenticated)
 *   code = "water_body:<id>" | "venue:<id>" — the printed brochure's QR
 *   encodes the merchant directly (see src/lib/brochure.js /
 *   src/pages/TraderVenues.jsx / src/pages/WaterBodyManagement.jsx). A
 *   successful, one-time-per-account redemption logs it in
 *   merchant_referrals and, only if that merchant has both
 *   bonus_days_per_referral > 0 AND a linked_custom_ad_id configured (both
 *   0/unset by default), extends that ad's expires_at by that many days —
 *   never displaces or otherwise touches any other banner.
 *
 * GET /api/merchant-referrals/stats?type=venue&id=<id>   (owner or admin)
 *   -> { referral_count }
 *
 * POST /api/merchant-referrals/active-merchants { ads: [{id, merchants: [{type,id},...], rotationMinutes}] }
 *   (public, no auth needed) -> { [adId]: {type, id} | undefined }
 *   v3.30 — for each ad with 2+ attached merchants (see custom_ads.merchants,
 *   v3.26), resolves which one should be showing RIGHT NOW, weighted by each
 *   merchant's current QR-code referral count (see MIN_SHARE/MAX_SHARE
 *   above) instead of a plain equal-share round robin. Deliberately never
 *   returns the underlying counts themselves, or even a relative ranking —
 *   only the one resolved winner per ad — because a merchant's referral
 *   count is NOT public (same rule the /stats endpoint above already
 *   enforces owner-or-admin-only for). Ads with 0 or 1 merchants are
 *   skipped entirely (the client already resolves those without any server
 *   help — see AdBannerItem.jsx).
 */
export async function handleMerchantReferralsRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  const [action] = path;
  const url = new URL(req.url);

  if (action === "redeem" && req.method === "POST") {
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const parsed = code ? parseCode(code) : null;
    if (!parsed) return json({ error: "Невалиден код за брошура" }, 400);

    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    if (accountAgeMs > NEW_ACCOUNT_WINDOW_MS) {
      return json({ error: "Брошурите важат само за нова регистрация" }, 400);
    }

    const table = MERCHANT_TABLES[parsed.type];
    const activeClause = parsed.type === "water_body" ? sql`status = 'approved'` : sql`is_active = TRUE`;
    const merchantRows = await sql<
      { id: string; bonus_days_per_referral: number; linked_custom_ad_id: string | null }[]
    >`
      SELECT id, bonus_days_per_referral, linked_custom_ad_id FROM ${sql(table)}
      WHERE id = ${parsed.id} AND ${activeClause}
    `;
    if (!merchantRows.length) return json({ error: "Невалиден или неактивен код за брошура" }, 400);
    const merchant = merchantRows[0];

    const already = await sql`SELECT id FROM merchant_referrals WHERE referred_id = ${user.id}`;
    if (already.length) return json({ error: "Вече сте използвали покана/брошура" }, 409);

    try {
      await sql`
        INSERT INTO merchant_referrals (merchant_type, merchant_id, referred_id)
        VALUES (${parsed.type}, ${parsed.id}, ${user.id})
      `;
    } catch {
      return json({ error: "Невалиден или вече използван код" }, 409);
    }

    if (merchant.bonus_days_per_referral > 0 && merchant.linked_custom_ad_id) {
      const adRows = await sql<{ expires_at: string | null }[]>`
        SELECT expires_at FROM custom_ads WHERE id = ${merchant.linked_custom_ad_id}
      `;
      if (adRows.length) {
        const nextExpiry = addDaysToDateString(adRows[0].expires_at, merchant.bonus_days_per_referral);
        await sql`
          UPDATE custom_ads SET expires_at = ${nextExpiry}, is_active = TRUE
          WHERE id = ${merchant.linked_custom_ad_id}
        `;
      }
    }

    return json({ success: true });
  }

  if (action === "stats" && req.method === "GET") {
    if (!user) return json({ error: "Not authenticated" }, 401);
    const type = url.searchParams.get("type") || "";
    const id = url.searchParams.get("id") || "";
    if (!MERCHANT_TABLES[type] || !id) return json({ error: "Invalid params" }, 400);

    // Owner-or-admin only — a merchant's referral count isn't public.
    if (!isAdmin(user)) {
      const table = MERCHANT_TABLES[type];
      const owned = await sql`SELECT id FROM ${sql(table)} WHERE id = ${id} AND created_by_id = ${user.id}`;
      if (!owned.length) return json({ error: "Forbidden" }, 403);
    }

    const rows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM merchant_referrals WHERE merchant_type = ${type} AND merchant_id = ${id}
    `;
    return json({ referral_count: rows[0]?.n ?? 0 });
  }

  if (action === "active-merchants" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const adsIn: Array<{ id?: string; merchants?: Array<{ type?: string; id?: string }>; rotationMinutes?: number }> =
      Array.isArray(body?.ads) ? body.ads : [];

    // Every distinct (type,id) merchant referenced across all requested
    // ads, so each one's count is only ever looked up once even if it's
    // attached to several banners at once.
    const merchantKeys = new Set<string>();
    for (const ad of adsIn) {
      for (const m of Array.isArray(ad?.merchants) ? ad.merchants : []) {
        if (m?.type && m?.id) merchantKeys.add(`${m.type}:${m.id}`);
      }
    }
    const counts: Record<string, number> = {};
    for (const key of merchantKeys) {
      const i = key.indexOf(":");
      const type = key.slice(0, i);
      const id = key.slice(i + 1);
      const rows = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM merchant_referrals WHERE merchant_type = ${type} AND merchant_id = ${id}
      `;
      counts[key] = rows[0]?.n ?? 0;
    }

    const result: Record<string, { type: string; id: string }> = {};
    for (const ad of adsIn) {
      const list = (Array.isArray(ad?.merchants) ? ad.merchants : []).filter((m) => m?.type && m?.id);
      if (!ad?.id || list.length < 2) continue;
      const minutes = Number(ad.rotationMinutes) > 0 ? Number(ad.rotationMinutes) : 30;
      const weighted: { type: string; id: string }[] = [];
      for (const m of list as Array<{ type: string; id: string }>) {
        const weight = Math.min(MAX_SHARE, MIN_SHARE + (counts[`${m.type}:${m.id}`] || 0));
        for (let i = 0; i < weight; i++) weighted.push(m);
      }
      if (weighted.length === 0) continue;
      const idx = Math.floor(Date.now() / (minutes * 60000)) % weighted.length;
      result[ad.id] = weighted[idx];
    }
    return json(result);
  }

  return json({ error: "Not found" }, 404);
}
