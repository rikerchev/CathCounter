import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { sendEmail } from "../lib/email.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Where the "Връзка с нас" (Contact Us) notification email always goes —
// fixed per the site owner's own request (rkerchev@gmail.com), not an
// Admin-configurable setting like SMTP itself. Kept as its own constant
// (not e.g. EMAIL_FROM) so a future admin-settings field could replace it
// without touching the route logic.
const CONTACT_NOTIFY_EMAIL = "rkerchev@gmail.com";

function isMissingSchemaError(e: unknown): boolean {
  return e instanceof Error && /relation "contact_messages" does not exist/.test(e.message);
}

/**
 * POST /api/contact { email, phone, message }   (authenticated)
 *   Stores the message (contact_messages table) and emails
 *   CONTACT_NOTIFY_EMAIL with the sender's email, phone and message —
 *   both email and phone are mandatory, per the site owner's request, so
 *   they can always follow up regardless of which channel the user prefers.
 *   Storing it too (not just emailing) means a lost/delayed email doesn't
 *   lose the message — see adminMigrations.ts's "v2.97-contact-messages".
 */
export async function handleContactRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (path.length === 0 && req.method === "POST") {
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!email || !phone || !message) {
      return json({ error: "Имейл, телефон и съобщение са задължителни" }, 400);
    }

    try {
      await sql`
        INSERT INTO contact_messages (user_id, email, phone, message)
        VALUES (${user.id}, ${email}, ${phone}, ${message})
      `;
    } catch (e) {
      if (isMissingSchemaError(e)) {
        // v2.97 migration not applied yet — still try to email below so the
        // message isn't silently lost, but tell the client the request
        // itself didn't fully succeed.
        try {
          await sendEmail({
            to: CONTACT_NOTIFY_EMAIL,
            subject: "Ново съобщение от CatchCount — Връзка с нас",
            html: `<p><b>Имейл:</b> ${email}</p><p><b>Телефон:</b> ${phone}</p><p><b>Съобщение:</b></p><p>${message.replace(/\n/g, "<br>")}</p>`,
          });
        } catch {
          // ignore — the 503 below already tells the user to try later
        }
        return json({ error: "Функцията все още се активира. Опитайте по-късно." }, 503);
      }
      throw e;
    }

    try {
      await sendEmail({
        to: CONTACT_NOTIFY_EMAIL,
        subject: "Ново съобщение от CatchCount — Връзка с нас",
        html: `<p><b>Имейл:</b> ${email}</p><p><b>Телефон:</b> ${phone}</p><p><b>Съобщение:</b></p><p>${message.replace(/\n/g, "<br>")}</p>`,
      });
    } catch (e) {
      // The message is already saved in the DB — don't fail the request
      // just because SMTP hiccupped; log it so it isn't silently lost.
      console.error("[contact] Failed to send notification email:", e);
    }

    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
