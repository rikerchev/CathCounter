import { getPaymentInfo, getAdSenseInfo, getConfig } from "../lib/settings.js";

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
  return json({ error: "Not found" }, 404);
}
