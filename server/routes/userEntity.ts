import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Never return password_hash / google_id to the client, no matter who's asking.
const SAFE_COLUMNS = `
  id, email, full_name, role, roles, country, menu_group_id,
  email_verified, created_at, updated_at
`;

// Only these are writable through this endpoint, and only by an admin —
// role/roles changes are a privilege-escalation risk, so this path is
// intentionally admin-only. A user editing their own profile uses
// PUT /api/auth/me instead (see routes/auth.ts), which never touches role/roles.
const WRITABLE_COLUMNS = ["full_name", "role", "roles", "country", "menu_group_id"];

export async function handleUserEntityRoute(
  req: Request,
  path: string[], // [] | ["filter"] | [":id"]
  user: AuthUser | null,
): Promise<Response> {
  const [sub] = path;
  if (!user) return json({ error: "Not authenticated" }, 401);

  const isAdminUser = isAdmin(user);

  // ---- LIST: GET /api/entities/User ----
  if (req.method === "GET" && !sub) {
    if (!isAdminUser) return json({ error: "Forbidden" }, 403);
    const rows = await sql`SELECT ${sql.unsafe(SAFE_COLUMNS)} FROM users ORDER BY created_at DESC`;
    return json(rows);
  }

  // ---- FILTER: POST /api/entities/User/filter  (body = { id } | { email } | ...) ----
  if (req.method === "POST" && sub === "filter") {
    const criteria = await req.json().catch(() => ({}));
    if (!isAdminUser && criteria.id !== user.id) return json({ error: "Forbidden" }, 403);

    let rows = await sql`SELECT ${sql.unsafe(SAFE_COLUMNS)} FROM users`;
    rows = rows.filter((r: Record<string, unknown>) =>
      Object.entries(criteria).every(([k, v]) => r[k] === v)
    );
    return json(rows);
  }

  // ---- GET ONE: GET /api/entities/User/:id ----
  if (req.method === "GET" && sub) {
    if (!isAdminUser && sub !== user.id) return json({ error: "Forbidden" }, 403);
    const rows = await sql`SELECT ${sql.unsafe(SAFE_COLUMNS)} FROM users WHERE id = ${sub}`;
    if (!rows.length) return json({ error: "Not found" }, 404);
    return json(rows[0]);
  }

  // ---- UPDATE: PUT/PATCH /api/entities/User/:id (admin only) ----
  if ((req.method === "PUT" || req.method === "PATCH") && sub) {
    if (!isAdminUser) return json({ error: "Forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const payload: Record<string, unknown> = {};
    for (const k of WRITABLE_COLUMNS) if (k in body) payload[k] = body[k];
    payload.updated_at = new Date();
    const keys = Object.keys(payload);
    const rows = await sql`
      UPDATE users SET ${sql(payload, ...keys)} WHERE id = ${sub}
      RETURNING ${sql.unsafe(SAFE_COLUMNS)}
    `;
    if (!rows.length) return json({ error: "Not found" }, 404);
    return json(rows[0]);
  }

  // ---- DELETE: DELETE /api/entities/User/:id (admin only) ----
  if (req.method === "DELETE" && sub) {
    if (!isAdminUser) return json({ error: "Forbidden" }, 403);
    if (sub === user.id) {
      // Never let an admin delete their own account through this screen —
      // that could lock everyone out of admin access with no way back in.
      return json({ error: "Не можете да изтриете собствения си акаунт" }, 400);
    }
    // Every other table's created_by_id is `ON DELETE SET NULL` (see
    // schema.sql), so this is safe: the user's catches/bait/etc. are kept,
    // just no longer attributed to a (now-deleted) account.
    const rows = await sql`DELETE FROM users WHERE id = ${sub} RETURNING id`;
    if (!rows.length) return json({ error: "Not found" }, 404);
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
