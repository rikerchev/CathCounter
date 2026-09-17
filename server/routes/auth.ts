import { sql } from "../db.js";
import { absoluteUrl } from "../lib/url.js";
import { env } from "../env.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { randomOtpCode, randomToken, sha256Hex } from "../lib/hash.js";
import { sendEmail } from "../lib/email.js";
import { buildGoogleAuthUrl, exchangeGoogleCode, isGoogleConfigured } from "../lib/googleOAuth.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Not `Response.redirect(url, 302)` — per the Fetch spec, a Response built
// that way has its headers guard set to "immutable", and router.ts's
// withCors() unconditionally does `res.headers.set(...)` on every response
// it returns (including these two Google login redirects). That threw a
// TypeError that never reached router.ts's own try/catch (it happens in
// the `.then(withCors)` step, after route() has already returned), which
// crashed the whole request — the browser saw Vercel's generic platform
// "Internal Server Error" page instead of anything from this app, and
// nobody could sign in (or register) with Google at all, existing users
// included. A plain `new Response(...)` with a Location header behaves
// identically as a redirect but keeps normal, mutable headers.
function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

const OTP_TTL_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

async function issueOtp(email: string, purpose: "verify_email" | "password_reset") {
  const code = randomOtpCode();
  const hash = await sha256Hex(code);
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  await sql`
    INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
    VALUES (${email}, ${hash}, ${purpose}, ${expires})
  `;
  return code;
}

// True only for the very first account ever created — used so a freshly
// migrated database doesn't need a manual "make me admin" step: whoever
// registers (or signs in with Google) first is trusted by definition, since
// nobody else could have gotten there first, so they skip email
// verification entirely and become admin straight away.
async function isFirstUser(): Promise<boolean> {
  const rows = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM users`;
  return (rows[0]?.count ?? 0) === 0;
}

function publicUser(u: AuthUser) {
  // Never send password_hash/google_id to the client.
  return u;
}

// A misconfigured or unreachable SMTP server must never block an auth flow
// that has already committed its real work (account created, OTP/token
// stored in the DB). Without this, e.g. registration would time out and
// look completely broken to the user just because email delivery is
// broken/slow — the account still needs to exist so a fixed SMTP config or
// a manual admin action can recover it later.
async function trySendEmail(opts: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(opts);
  } catch (e) {
    console.error(`[auth] Failed to send email to ${opts.to}:`, e);
  }
}

export async function handleAuthRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  const [action] = path;
  const url = absoluteUrl(req);

  // ---- POST /api/auth/register { email, password, acceptedTerms } ----
  if (action === "register" && req.method === "POST") {
    const { email, password, acceptedTerms } = await req.json();
    if (!email || !password) return json({ error: "Missing email or password" }, 400);
    // v2.98 — the checkbox is required client-side too (Register.jsx), this
    // is the actual enforcement. A Google sign-in has no registration form
    // of its own to carry a checkbox, so those accounts (and every account
    // that existed before v2.98) are instead caught by the app-wide
    // TermsGate.jsx the first time they use the app post-login.
    if (!acceptedTerms) {
      return json({ error: "Трябва да приемете общите условия" }, 400);
    }

    const existing = await sql<{ id: string; email_verified: boolean }[]>`
      SELECT id, email_verified FROM users WHERE email = ${email}
    `;
    if (existing.length) {
      if (existing[0].email_verified) {
        return json({ error: "Този имейл вече е регистриран" }, 409);
      }
      // An unverified account for this email already exists — most likely
      // a previous registration whose confirmation code never arrived (bad
      // SMTP config) or whose response the client never saw (a timeout).
      // Re-send a fresh code instead of dead-ending the user with
      // "already registered" and no way forward. The stored password is
      // left untouched — only the emailed OTP can actually unlock it.
      const code = await issueOtp(email, "verify_email");
      await trySendEmail({
        to: email,
        subject: "Потвърдете имейла си — CatchCount",
        text: `Вашият код за потвърждение е: ${code} (валиден ${OTP_TTL_MINUTES} минути)`,
      });
      return json({ success: true });
    }

    const first = await isFirstUser();
    const passwordHash = await hashPassword(password);
    // Email verification — re-enabled in v2.51 now that SMTP is configured
    // and confirmed working (Admin → Настройка на интеграциите → „Изпрати
    // тестов имейл“). The first account ever created (nobody else could
    // have registered yet) still skips it and logs straight in as admin,
    // same as Google sign-in always has — everyone else must confirm a
    // one-time code emailed to them before they can log in (issueOtp +
    // trySendEmail + `return json({ success: true })` below, mirroring the
    // "existing unverified account" branch above it).
    // terms_accepted_at may not exist yet if the code deployed (git push)
    // before the admin clicked "Приложи обновление" for v2.98 — fall back to
    // an insert without it rather than 500ing every registration in that
    // gap; see the matching fallback in middleware/auth.ts's getUserFromRequest.
    let rows: AuthUser[];
    try {
      rows = await sql<AuthUser[]>`
        INSERT INTO users (email, password_hash, role, email_verified, terms_accepted_at)
        VALUES (${email}, ${passwordHash}, ${first ? "admin" : "user"}, ${first}, now())
        RETURNING *
      `;
    } catch (e) {
      if (e instanceof Error && /terms_accepted_at/.test(e.message)) {
        rows = await sql<AuthUser[]>`
          INSERT INTO users (email, password_hash, role, email_verified)
          VALUES (${email}, ${passwordHash}, ${first ? "admin" : "user"}, ${first})
          RETURNING *
        `;
      } else {
        throw e;
      }
    }

    const u = rows[0];
    if (first) {
      const token = signToken({ sub: u.id, email: u.email, role: u.role });
      return json({ access_token: token, user: publicUser(u) });
    }

    const code = await issueOtp(email, "verify_email");
    await trySendEmail({
      to: email,
      subject: "Потвърдете имейла си — CatchCount",
      text: `Вашият код за потвърждение е: ${code} (валиден ${OTP_TTL_MINUTES} минути)`,
    });
    return json({ success: true });
  }

  // ---- POST /api/auth/resend-otp { email } ----
  if (action === "resend-otp" && req.method === "POST") {
    const { email } = await req.json();
    const code = await issueOtp(email, "verify_email");
    await trySendEmail({
      to: email,
      subject: "Нов код за потвърждение — CatchCount",
      text: `Вашият нов код е: ${code} (валиден ${OTP_TTL_MINUTES} минути)`,
    });
    return json({ success: true });
  }

  // ---- POST /api/auth/verify-otp { email, otpCode } -> { access_token } ----
  if (action === "verify-otp" && req.method === "POST") {
    const { email, otpCode } = await req.json();
    const hash = await sha256Hex(otpCode);
    const rows = await sql`
      SELECT id FROM otp_codes
      WHERE email = ${email} AND code_hash = ${hash} AND purpose = 'verify_email'
        AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!rows.length) return json({ error: "Невалиден или изтекъл код" }, 400);

    await sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${rows[0].id}`;
    const userRows = await sql<AuthUser[]>`
      UPDATE users SET email_verified = TRUE WHERE email = ${email} RETURNING *
    `;
    const u = userRows[0];
    const token = signToken({ sub: u.id, email: u.email, role: u.role });
    return json({ access_token: token });
  }

  // ---- POST /api/auth/login { email, password } -> { access_token } ----
  if (action === "login" && req.method === "POST") {
    const { email, password } = await req.json();
    const rows = await sql<Array<AuthUser & { password_hash: string | null }>>`
      SELECT * FROM users WHERE email = ${email}
    `;
    const u = rows[0];
    if (!u || !u.password_hash || !(await verifyPassword(password, u.password_hash))) {
      return json({ error: "Грешен имейл или парола" }, 401);
    }
    const token = signToken({ sub: u.id, email: u.email, role: u.role });
    return json({ access_token: token, user: publicUser(u) });
  }

  // ---- GET /api/auth/google?returnTo=... -> redirect to Google ----
  if (action === "google" && !path[1] && req.method === "GET") {
    if (!(await isGoogleConfigured())) return json({ error: "Google login not configured" }, 501);
    const returnTo = url.searchParams.get("returnTo") || "/";
    const state = encodeURIComponent(returnTo);
    return redirect(await buildGoogleAuthUrl(state));
  }

  // ---- GET /api/auth/google/callback?code=...&state=... ----
  if (action === "google" && path[1] === "callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "/";
    if (!code) return json({ error: "Missing code" }, 400);

    const profile = await exchangeGoogleCode(code);
    let rows = await sql<AuthUser[]>`SELECT * FROM users WHERE google_id = ${profile.sub}`;
    if (!rows.length) {
      rows = await sql<AuthUser[]>`SELECT * FROM users WHERE email = ${profile.email}`;
      if (rows.length) {
        rows = await sql<AuthUser[]>`
          UPDATE users SET google_id = ${profile.sub}, email_verified = TRUE
          WHERE id = ${rows[0].id} RETURNING *
        `;
      } else {
        const first = await isFirstUser();
        rows = await sql<AuthUser[]>`
          INSERT INTO users (email, google_id, full_name, role, email_verified)
          VALUES (${profile.email}, ${profile.sub}, ${profile.name ?? null}, ${first ? "admin" : "user"}, TRUE)
          RETURNING *
        `;
      }
    }
    const u = rows[0];
    const token = signToken({ sub: u.id, email: u.email, role: u.role });

    // Full-page browser redirect back to the SPA; the frontend's base44Client
    // shim reads the token from the URL fragment and stores it (mirrors how
    // base44's own `access_token=` URL param + app-params.js bootstrap worked).
    const dest = new URL(decodeURIComponent(state), env.PUBLIC_APP_URL);
    dest.hash = `access_token=${token}`;
    return redirect(dest.toString());
  }

  // ---- POST /api/auth/reset-password-request { email } ----
  if (action === "reset-password-request" && req.method === "POST") {
    const { email } = await req.json();
    const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (rows.length) {
      const token = randomToken();
      const hash = await sha256Hex(token);
      const expires = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
      await sql`
        INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
        VALUES (${email}, ${hash}, 'password_reset', ${expires})
      `;
      const link = `${env.PUBLIC_APP_URL}/reset-password?token=${token}`;
      await trySendEmail({
        to: email,
        subject: "Възстановяване на парола — CatchCount",
        html: `<p>Натиснете <a href="${link}">тук</a>, за да зададете нова парола. Линкът е валиден ${RESET_TTL_MINUTES} минути.</p>`,
      });
    }
    // Always return success — never reveal whether an email is registered.
    return json({ success: true });
  }

  // ---- POST /api/auth/reset-password { resetToken, newPassword } ----
  if (action === "reset-password" && req.method === "POST") {
    const { resetToken, newPassword } = await req.json();
    const hash = await sha256Hex(resetToken);
    const rows = await sql`
      SELECT id, email FROM otp_codes
      WHERE code_hash = ${hash} AND purpose = 'password_reset'
        AND consumed_at IS NULL AND expires_at > now()
      LIMIT 1
    `;
    if (!rows.length) return json({ error: "Линкът е невалиден или изтекъл" }, 400);

    const passwordHash = await hashPassword(newPassword);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE email = ${rows[0].email}`;
    await sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${rows[0].id}`;
    return json({ success: true });
  }

  // ---- GET /api/auth/me ----
  if (action === "me" && req.method === "GET") {
    if (!user) return json({ error: "Not authenticated" }, 401);
    return json(publicUser(user));
  }

  // ---- PUT /api/auth/me { ...patch } ----
  if (action === "me" && req.method === "PUT") {
    if (!user) return json({ error: "Not authenticated" }, 401);
    const patch = await req.json();
    const allowed = ["full_name", "country", "menu_group_id"] as const;
    const set: Record<string, unknown> = {};
    for (const k of allowed) if (k in patch) set[k] = patch[k];
    set.updated_at = new Date();
    const keys = Object.keys(set);
    const rows = await sql<AuthUser[]>`
      UPDATE users SET ${sql(set, ...keys)} WHERE id = ${user.id} RETURNING *
    `;
    return json(publicUser(rows[0]));
  }

  // ---- POST /api/auth/accept-terms ----
  // v2.98 — records acceptance for an already-logged-in account: existing
  // accounts (created before this feature) and Google sign-ins (no
  // registration-form checkbox of their own) both reach this via
  // TermsGate.jsx, which blocks the rest of the app until it succeeds.
  if (action === "accept-terms" && req.method === "POST") {
    if (!user) return json({ error: "Not authenticated" }, 401);
    try {
      const rows = await sql<AuthUser[]>`
        UPDATE users SET terms_accepted_at = now() WHERE id = ${user.id} RETURNING *
      `;
      return json(publicUser(rows[0]));
    } catch (e) {
      if (e instanceof Error && /terms_accepted_at/.test(e.message)) {
        // v2.98 migration not applied yet — nothing to record; the gate
        // wouldn't have shown ("pending-migration" sentinel, see
        // middleware/auth.ts) so this shouldn't normally be reachable, but
        // fail soft instead of a raw 500 either way.
        return json({ error: "Функцията все още се активира. Опитайте по-късно." }, 503);
      }
      throw e;
    }
  }

  // ---- POST /api/auth/invite { email, role } (admin only) ----
  if (action === "invite" && req.method === "POST") {
    if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
    const { email, role } = await req.json();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) return json({ error: "Вече съществува потребител с този имейл" }, 409);

    await sql`INSERT INTO users (email, role, email_verified) VALUES (${email}, ${role || "user"}, FALSE)`;
    const token = randomToken();
    const hash = await sha256Hex(token);
    const expires = new Date(Date.now() + 24 * 60 * 60_000);
    await sql`
      INSERT INTO otp_codes (email, code_hash, purpose, expires_at)
      VALUES (${email}, ${hash}, 'password_reset', ${expires})
    `;
    const link = `${env.PUBLIC_APP_URL}/reset-password?token=${token}`;
    await trySendEmail({
      to: email,
      subject: "Поканени сте в CatchCount",
      html: `<p>Създаден Ви е акаунт в CatchCount. Натиснете <a href="${link}">тук</a>, за да зададете парола (валидно 24 часа).</p>`,
    });
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
