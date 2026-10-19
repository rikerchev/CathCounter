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

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// v3.129 — POST /api/contact/public { name?, email, phone, message, website?, lang? }
// (NO authentication) — the contact form on the public pages (/kontakti,
// /<lang>/contact, see public/*.html). Same storage (contact_messages, with
// user_id NULL) and same notification email as the logged-in form above.
// Spam protection, since anyone can call it: a honeypot field ("website" —
// real visitors never see or fill it; a filled one is answered with a fake
// success so bots don't retry), length limits, an email-format check, and
// DB-backed rate limits (max 3 per email and max 30 public messages in total
// per hour; they work across serverless instances, unlike an in-memory
// counter). All user text is HTML-escaped before it goes into the email.
async function handlePublicContact(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(body?.name, 100);
  const email = str(body?.email, 200);
  const phone = str(body?.phone, 40);
  const message = str(body?.message, 3000);
  const lang = str(body?.lang, 10).replace(/[^a-zA-Z-]/g, "");

  if (str(body?.website, 200)) return json({ success: true }); // honeypot

  if (!email || !phone || !message) {
    return json({ error: "Имейл, телефон и съобщение са задължителни" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Невалиден имейл адрес" }, 400);
  }

  const stored = `[Публична страница${lang ? ", език " + lang : ""}]${name ? " Име: " + name + "." : ""}\n${message}`;

  let storedOk = false;
  try {
    const perEmail = await sql`
      SELECT COUNT(*)::int AS n FROM contact_messages
      WHERE lower(email) = ${email.toLowerCase()} AND created_at > now() - interval '1 hour'
    `;
    const total = await sql`
      SELECT COUNT(*)::int AS n FROM contact_messages
      WHERE user_id IS NULL AND created_at > now() - interval '1 hour'
    `;
    if ((perEmail[0]?.n ?? 0) >= 3 || (total[0]?.n ?? 0) >= 30) {
      return json({ error: "Too many messages" }, 429);
    }
    await sql`
      INSERT INTO contact_messages (user_id, email, phone, message)
      VALUES (NULL, ${email}, ${phone}, ${stored})
    `;
    storedOk = true;
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    // v2.97 migration not applied yet — fall through and rely on the email.
  }

  let emailed = false;
  try {
    await sendEmail({
      to: CONTACT_NOTIFY_EMAIL,
      subject: "Ново съобщение от CatchCount — публична страница Контакти",
      html: `<p><b>Име:</b> ${escapeHtml(name) || "—"}</p><p><b>Имейл:</b> ${escapeHtml(email)}</p><p><b>Телефон:</b> ${escapeHtml(phone)}</p><p><b>Език на страницата:</b> ${escapeHtml(lang) || "—"}</p><p><b>Съобщение:</b></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    });
    emailed = true;
  } catch (e) {
    console.error("[contact] Failed to send public notification email:", e);
  }

  if (!storedOk && !emailed) return json({ error: "Temporarily unavailable" }, 503);
  return json({ success: true });
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
  if (path.length === 1 && path[0] === "public" && req.method === "POST") {
    return await handlePublicContact(req);
  }

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
