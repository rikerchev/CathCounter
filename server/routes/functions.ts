import { sql } from "../db.js";
import { env } from "../env.js";
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
 * Dispatch table mirroring `base44.functions.invoke(name, payload)` from the
 * frontend — same function names, same request/response shape, just backed
 * by our own DB instead of the base44 SDK / `base44:runtime` secrets.
 *
 * Note: the paid Stripe checkout/webhook/Connect functions that used to live
 * here have been removed — no paid payment processor is required to run
 * this app. Any paid feature (ad slots, competition fees, sector
 * reservations) is settled manually (e.g. bank transfer / Revolut, see
 * src/lib/payment.js) and an admin marks the relevant record as paid by hand
 * via the admin screens instead of an automatic webhook.
 */
export async function handleFunctionsRoute(
  req: Request,
  path: string[], // [functionName]
  user: AuthUser | null,
): Promise<Response> {
  const [name] = path;

  if (name === "notify-competition-users" && req.method === "POST") {
    try {
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { competition_id } = await req.json();
      if (!competition_id) return json({ error: "Missing competition_id" }, 400);

      const comps = await sql`SELECT * FROM competitions WHERE id = ${competition_id}`;
      if (!comps.length) return json({ error: "Competition not found" }, 404);
      const competition = comps[0];

      let waterBody = null;
      if (competition.water_body_id) {
        const wbs = await sql`SELECT * FROM water_bodies WHERE id = ${competition.water_body_id}`;
        waterBody = wbs[0] ?? null;
      }

      const isAuthorized = isAdmin(user) ||
        (waterBody && waterBody.created_by_id === user.id);
      if (!isAuthorized) return json({ error: "Forbidden" }, 403);

      const targetCountry = waterBody?.country || "";
      const fee = competition.fee ?? waterBody?.fee_per_person ?? 0;

      const targetUsers = targetCountry
        ? await sql`SELECT * FROM users WHERE country = ${targetCountry}`
        : await sql`SELECT * FROM users`;

      if (!targetUsers.length) return json({ notified: 0, message: "No users found" });

      const registrationUrl = `${env.PUBLIC_APP_URL}/competitions?comp=${competition.id}`;

      // Fire-and-forget, same as base44's `waitUntil` — respond immediately,
      // keep sending in the background. `EdgeRuntime`/`waitUntil` doesn't
      // exist as a plain Deno API, so this just lets the promise run
      // detached; the process needs to stay alive until it settles (true for
      // a long-running server, unlike a one-shot edge function).
      (async () => {
        for (const u of targetUsers) {
          try {
            await sendEmail({
              to: u.email,
              subject: `Ново състезание: ${competition.title}`,
              html: `<p>Ново състезание "${competition.title}" очаква регистрация.</p><p><a href="${registrationUrl}">Регистрирай се</a></p>`,
            });
          } catch { /* best-effort */ }
          try {
            await sql`
              INSERT INTO notifications (user_id, type, title, message, link, read, created_by_id)
              VALUES (${u.id}, 'competition', ${`Ново състезание: ${competition.title}`},
                      ${`Състезанието "${competition.title}" вече е отворено за регистрация.`},
                      ${`/competitions?comp=${competition.id}`}, FALSE, ${user.id})
            `;
          } catch { /* best-effort */ }
        }
      })();

      return json({ notified: targetUsers.length, country: targetCountry || "all", fee });
    } catch (error) {
      return json({ error: (error as Error).message }, 500);
    }
  }

  return json({ error: `Unknown function: ${name}` }, 404);
}
