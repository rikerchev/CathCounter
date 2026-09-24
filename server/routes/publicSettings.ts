import { getPaymentInfo, getAdSenseInfo, getConfig } from "../lib/settings.js";
import { sql } from "../db.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * GET /api/settings/payment -> { revolut, bank, note }
 * Public on purpose: advertisers/renters need this to know how to pay,
 * before and without needing admin rights. No secrets live in these keys.
 *
 * GET /api/settings/adsense -> { enabled, publisherId }
 * Public on purpose (v2.68): the frontend needs this before it can decide
 * whether to load the AdSense script for the current (non-premium) visitor.
 * Not a secret — a publisher ID is visible in the page source the moment
 * AdSense actually runs anyway.
 *
 * GET /api/settings/menu-order -> { order: MenuOrder | null }
 * Public on purpose (v2.88): drives the display order of EVERY user's own
 * sidebar/mobile nav (Layout.jsx), not just the admin's — see
 * src/lib/menuOrder.js for the shape and the client-side default fallback
 * used when `order` is null (nothing saved yet). Writing it stays admin-only
 * via the existing PUT /api/admin/settings (adminSettings.ts) — no new
 * write endpoint needed.
 *
 * GET /api/settings/ads-version -> { version: string | null }
 * v3.64 — public, deliberately tiny: just the latest `updated_at` across
 * custom_ads and ad_slots (whichever is newer), no ad content at all. Lets
 * useEligibleAds.js poll this cheaply and often (every
 * AD_VERSION_POLL_INTERVAL_MS — see src/lib/adCache.js) to detect that an
 * admin changed something (a new/edited banner in "Собствени реклами", a
 * slot's source in "Управление на реклами", ...) and, ONLY then, trigger
 * the real (heavier) CustomAd.list()+AdSlot.list() resync right away —
 * instead of every open device waiting up to AD_SYNC_INTERVAL_MS (10 min)
 * or a page navigation to notice. `version` is `null` when neither table
 * has any row yet (fresh install) — the client just treats that as "no
 * signal yet" and keeps its existing throttled/navigation-based sync as
 * the fallback.
 */
export async function handlePublicSettingsRoute(req: Request, path: string[]): Promise<Response> {
  if (path[0] === "payment") {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);
    return json(await getPaymentInfo());
  }
  if (path[0] === "adsense") {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);
    return json(await getAdSenseInfo());
  }
  if (path[0] === "menu-order") {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);
    const raw = await getConfig("MENU_ORDER");
    let order: unknown = null;
    if (raw) {
      try {
        order = JSON.parse(raw);
      } catch {
        order = null;
      }
    }
    return json({ order });
  }
  if (path[0] === "ads-version") {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);
    // GREATEST() over two possibly-empty tables: COALESCE falls back to the
    // Unix epoch for whichever table has no rows yet (fresh install), so
    // this always returns a single comparable value, never NULL — the
    // client only cares whether it CHANGES between polls, not its absolute
    // value, so an epoch baseline is harmless and never triggers a false
    // resync on its own.
    const rows = await sql<{ version: string }[]>`
      SELECT GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM custom_ads), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(updated_at) FROM ad_slots), 'epoch'::timestamptz)
      ) AS version
    `;
    return json({ version: rows[0]?.version ?? null });
  }
  return json({ error: "Not found" }, 404);
}
