import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /api/competition-registrations/:id/reassign   body={email}
 * -> { item, user }  (admin, or the competition's own organizer)
 *
 * v2.90 — "assign this registration to a real system account" (organizer's
 * request, WaterBodyManagement.jsx's participant-edit dialog): looks up a
 * user by email and moves this registration's created_by_id to them,
 * permanently detaching it from whoever originally submitted it (that
 * original account is still recorded, unaffected, in registered_by_email —
 * see entities.generated.ts's comment on that column).
 *
 * created_by_id is deliberately excluded from every entity's generic
 * writable columns (see entities.ts's sanitizePayload), so — same reason as
 * adminMerchants.ts's reassignOwner — this needs its own small endpoint.
 * Unlike adminMerchants.ts, this one is NOT admin-only: the water body
 * owner running the competition needs it too, so access here mirrors
 * CompetitionRegistration's own update rule's "relation" half (this row's
 * competition_id -> competitions.created_by_id) rather than isAdmin() alone.
 *
 * Deliberately does NOT also expose a general "search users" capability to
 * non-admins — the organizer types an exact email, the server resolves it
 * and reassigns in the same call, so no new way to enumerate accounts is
 * added for a non-admin caller.
 */
export async function handleCompetitionRegistrationsRoute(
  req: Request,
  path: string[], // [":id", "reassign"]
  user: AuthUser | null,
): Promise<Response> {
  if (!user) return json({ error: "Not authenticated" }, 401);

  const [id, action] = path;
  if (!id || action !== "reassign" || req.method !== "POST") {
    return json({ error: "Not found" }, 404);
  }

  const regRows = await sql<{ id: string; competition_id: string }[]>`
    SELECT id, competition_id FROM competition_registrations WHERE id = ${id}
  `;
  const reg = regRows[0];
  if (!reg) return json({ error: "Not found" }, 404);

  if (!isAdmin(user)) {
    const compRows = await sql<{ created_by_id: string | null }[]>`
      SELECT created_by_id FROM competitions WHERE id = ${reg.competition_id}
    `;
    if (compRows[0]?.created_by_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json({ error: "Имейл е задължителен" }, 400);

  const userRows = await sql<{ id: string; email: string; full_name: string | null }[]>`
    SELECT id, email, full_name FROM users WHERE lower(email) = ${email}
  `;
  const target = userRows[0];
  if (!target) return json({ error: "Не е намерен потребител с този имейл" }, 404);

  const updated = await sql`
    UPDATE competition_registrations
    SET created_by_id = ${target.id}, assigned_user_email = ${target.email}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return json({ item: updated[0], user: target });
}
