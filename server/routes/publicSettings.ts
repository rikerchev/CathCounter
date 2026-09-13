import { getPaymentInfo } from "../lib/settings.js";

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
 */
export async function handlePublicSettingsRoute(req: Request, path: string[]): Promise<Response> {
  if (path[0] === "payment") {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);
    return json(await getPaymentInfo());
  }
  return json({ error: "Not found" }, 404);
}
