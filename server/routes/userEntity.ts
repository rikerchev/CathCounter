import { sql } from "../db.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { isAdmin } from "../middleware/auth.ts";

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

  return json({ error: "Not found" }, 404);
}
