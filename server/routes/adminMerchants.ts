import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TABLE_BY_TYPE: Record<string, string> = {
  water_body: "water_bodies",
  venue: "venues",
};

/**
 * PATCH /api/admin/merchants/:type/:id   body={created_by_id} -> updated row (admin only)
 *
 * v2.77 — "reassign which registered user owns this water body / venue",
 * from the merged Търговци admin screen (AdminTraders.jsx). Needs its own
 * tiny endpoint rather than going through the generic /api/entities update
 * path: created_by_id is deliberately excluded from every entity's writable
 * `columns` list in entities.generated.ts (see entities.ts's
 * sanitizePayload), so a generic entity PATCH silently strips it — this is
 * the one, narrow, admin-only place that's actually allowed to change it.
 */
export async function handleAdminMerchantsRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  const [type, id] = path;
  const table = type ? TABLE_BY_TYPE[type] : undefined;
  if (!table || !id) return json({ error: "Unknown merchant type" }, 400);

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    const newOwnerId = typeof body.created_by_id === "string" ? body.created_by_id : null;
    if (!newOwnerId) return json({ error: "created_by_id required" }, 400);

    const owner = await sql<{ id: string }[]>`SELECT id FROM users WHERE id = ${newOwnerId}`;
    if (owner.length === 0) return json({ error: "User not found" }, 404);

    const rows = await sql.unsafe(
      `UPDATE ${table} SET created_by_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [newOwnerId, id],
    );
    if ((rows as unknown[]).length === 0) return json({ error: "Not found" }, 404);
    return json({ item: (rows as unknown[])[0] });
  }

  return json({ error: "Not found" }, 404);
}
