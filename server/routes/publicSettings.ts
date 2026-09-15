import { getPaymentInfo, getAdSenseInfo } from "../lib/settings.js";

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
  return json({ error: "Not found" }, 404);
}
