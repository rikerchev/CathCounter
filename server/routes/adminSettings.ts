import { getConfig, getSettingsStatus, setSettings } from "../lib/settings.js";
import { sendEmail } from "../lib/email.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * GET  /api/admin/settings            -> current status of every wizard-configurable key
 * PUT  /api/admin/settings            -> { KEY: value, ... } upsert (admin only)
 * POST /api/admin/settings/test-email -> { to } sends a real test email through the
 *   currently SAVED SMTP settings (admin only) — added so the Setup Wizard's
 *   "Изпрати тестов имейл" button can confirm the config actually works,
 *   instead of the admin only finding out when a real registration/reset
 *   email silently never arrives. Deliberately does NOT reuse
 *   sendEmail()'s normal silent no-op for a missing SMTP_HOST (fine for
 *   auth flows, which must never block on email) — a "test" button needs
 *   to say plainly when nothing was actually sent.
 */
export async function handleAdminSettingsRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  if (path[0] === "test-email" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    if (!to) return json({ error: "Липсва получател" }, 400);

    const host = await getConfig("SMTP_HOST");
    if (!host) {
      return json({ error: "SMTP не е настроен — попълнете и запазете полетата по-горе." }, 400);
    }

    try {
      await sendEmail({
        to,
        subject: "CatchCount — тестов имейл",
        text: "Това е тестов имейл от CatchCount. Ако го виждате, SMTP настройките работят правилно.",
        html: "<p>Това е тестов имейл от <strong>CatchCount</strong>.</p><p>Ако го виждате, SMTP настройките работят правилно.</p>",
      });
      return json({ success: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Неуспешно изпращане" }, 502);
    }
  }

  if (path.length === 0 && req.method === "GET") {
    return json(await getSettingsStatus());
  }

  if (path.length === 0 && req.method === "PUT") {
    const patch = await req.json().catch(() => ({}));
    if (typeof patch !== "object" || patch === null) {
      return json({ error: "Invalid payload" }, 400);
    }
    await setSettings(patch);
    return json(await getSettingsStatus());
  }

  return json({ error: "Not found" }, 404);
}
