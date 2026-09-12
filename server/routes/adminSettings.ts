import { getSettingsStatus, setSettings } from "../lib/settings";
import type { AuthUser } from "../middleware/auth";
import { isAdmin } from "../middleware/auth";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * GET  /api/admin/settings -> current status of every wizard-configurable key
 * PUT  /api/admin/settings -> { KEY: value, ... } upsert (admin only)
 */
export async function handleAdminSettingsRoute(
  req: Request,
  user: AuthUser | null,
): Promise<Response> {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  if (req.method === "GET") {
    return json(await getSettingsStatus());
  }

  if (req.method === "PUT") {
    const patch = await req.json().catch(() => ({}));
    if (typeof patch !== "object" || patch === null) {
      return json({ error: "Invalid payload" }, 400);
    }
    await setSettings(patch);
    return json(await getSettingsStatus());
  }

  return json({ error: "Not found" }, 404);
}
