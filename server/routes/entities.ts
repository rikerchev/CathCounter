import { sql } from "../db.ts";
import { ENTITIES } from "../schema/entities.generated.ts";
import type { EntityDef } from "../schema/entities.generated.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { isAdmin } from "../middleware/auth.ts";
import { isAllowed } from "../middleware/authorize.ts";
import { handleUserEntityRoute } from "./userEntity.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function columnNames(entity: EntityDef): string[] {
  return entity.columns.map((c) => c.name);
}

// Only allow writing columns the entity actually declares — never trust the
// client for `id`, `created_by_id`, `created_at`, `updated_at`.
function sanitizePayload(entity: EntityDef, body: Record<string, unknown>) {
  const allowed = new Set(columnNames(entity));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

async function fetchRow(table: string, id: string) {
  const rows = await sql`SELECT * FROM ${sql(table)} WHERE id = ${id}`;
  return rows[0] ?? null;
}

function parseSort(sortParam: string | null): { column: string; dir: "ASC" | "DESC" } | null {
  if (!sortParam) return null;
  const desc = sortParam.startsWith("-");
  const raw = desc ? sortParam.slice(1) : sortParam;
  // base44 convention used across the frontend is "-created_date"; our
  // column is `created_at`.
  const column = raw === "created_date" ? "created_at" : raw;
  return { column, dir: desc ? "DESC" : "ASC" };
}

export async function handleEntitiesRoute(
  req: Request,
  path: string[], // e.g. ["Catch"] or ["Catch", "abc-123"] or ["Catch", "filter"]
  user: AuthUser | null,
): Promise<Response> {
  const [entityName, sub] = path;

  // "User" isn't in the generic ENTITIES registry — it's the auth table, with
  // sensitive columns (password_hash, google_id) and admin/self semantics
  // that don't fit the generic owner/public/admin_only rule shapes. Handled
  // separately so a generic entity name never accidentally resolves to it.
  if (entityName === "User") {
    return handleUserEntityRoute(req, path.slice(1), user);
  }

  const entity = ENTITIES[entityName];
  if (!entity) return json({ error: `Unknown entity: ${entityName}` }, 404);
  const table = entity.table;
  const cols = columnNames(entity);

  // ---- LIST: GET /api/entities/:name ----
  if (req.method === "GET" && !sub) {
    if (!(await isAllowed(entity, "read", user))) return json({ error: "Forbidden" }, 403);
    const url = new URL(req.url);
    const sort = parseSort(url.searchParams.get("sort"));
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);

    let whereClause = sql``;
    const rule = entity.rules.read;
    if (!isAdmin(user) && rule.kind === "owner") {
      whereClause = sql`WHERE ${sql(rule.field)} = ${user?.id ?? "___none___"}`;
    }

    let rows;
    if (sort && cols.includes(sort.column)) {
      rows = sort.dir === "DESC"
        ? await sql`SELECT * FROM ${sql(table)} ${whereClause} ORDER BY ${sql(sort.column)} DESC LIMIT ${limit}`
        : await sql`SELECT * FROM ${sql(table)} ${whereClause} ORDER BY ${sql(sort.column)} ASC LIMIT ${limit}`;
    } else {
      rows = await sql`SELECT * FROM ${sql(table)} ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`;
    }
    return json(rows);
  }

  // ---- FILTER: POST /api/entities/:name/filter  (body = { field: value, ... }) ----
  if (req.method === "POST" && sub === "filter") {
    if (!(await isAllowed(entity, "read", user))) return json({ error: "Forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const criteria = sanitizePayload(entity, body);

    let rows = await sql`SELECT * FROM ${sql(table)}`;
    // Apply ownership scoping first, then in-memory filter for simplicity —
    // entity tables here are small (per-user fishing logs, not analytics-scale).
    const rule = entity.rules.read;
    if (!isAdmin(user) && rule.kind === "owner") {
      rows = rows.filter((r: Record<string, unknown>) => r[rule.field] === user?.id);
    }
    rows = rows.filter((r: Record<string, unknown>) =>
      Object.entries(criteria).every(([k, v]) => r[k] === v)
    );
    return json(rows);
  }

  // ---- GET ONE: GET /api/entities/:name/:id ----
  if (req.method === "GET" && sub) {
    const row = await fetchRow(table, sub);
    if (!row) return json({ error: "Not found" }, 404);
    if (!(await isAllowed(entity, "read", user, row))) return json({ error: "Forbidden" }, 403);
    return json(row);
  }

  // ---- CREATE: POST /api/entities/:name ----
  if (req.method === "POST" && !sub) {
    const body = await req.json().catch(() => ({}));
    if (!(await isAllowed(entity, "create", user, body))) return json({ error: "Forbidden" }, 403);
    const payload = sanitizePayload(entity, body);
    payload.created_by_id = user?.id ?? null;

    const keys = Object.keys(payload);
    const rows = await sql`
      INSERT INTO ${sql(table)} ${sql(payload, ...keys)}
      RETURNING *
    `;
    return json(rows[0], 201);
  }

  // ---- BULK CREATE: POST /api/entities/:name/bulk-create  (body = { records: [...] }) ----
  if (req.method === "POST" && sub === "bulk-create") {
    const body = await req.json().catch(() => ({ records: [] }));
    const records = Array.isArray(body.records) ? body.records : [];
    if (!(await isAllowed(entity, "create", user))) return json({ error: "Forbidden" }, 403);
    const created = [];
    for (const rec of records) {
      const payload = sanitizePayload(entity, rec);
      payload.created_by_id = user?.id ?? null;
      const keys = Object.keys(payload);
      const rows = await sql`INSERT INTO ${sql(table)} ${sql(payload, ...keys)} RETURNING *`;
      created.push(rows[0]);
    }
    return json(created, 201);
  }

  // ---- UPDATE: PUT/PATCH /api/entities/:name/:id ----
  if ((req.method === "PUT" || req.method === "PATCH") && sub && sub !== "bulk-update") {
    const existing = await fetchRow(table, sub);
    if (!existing) return json({ error: "Not found" }, 404);
    if (!(await isAllowed(entity, "update", user, existing))) return json({ error: "Forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const payload = sanitizePayload(entity, body);
    payload.updated_at = new Date();
    const keys = Object.keys(payload);
    if (keys.length === 0) return json(existing);
    const rows = await sql`
      UPDATE ${sql(table)} SET ${sql(payload, ...keys)} WHERE id = ${sub} RETURNING *
    `;
    return json(rows[0]);
  }

  // ---- BULK UPDATE: PUT /api/entities/:name/bulk-update (body = { records: [{id, ...}] }) ----
  if (req.method === "PUT" && sub === "bulk-update") {
    const body = await req.json().catch(() => ({ records: [] }));
    const records = Array.isArray(body.records) ? body.records : [];
    const updated = [];
    for (const rec of records) {
      const { id, ...rest } = rec;
      const existing = await fetchRow(table, id);
      if (!existing) continue;
      if (!(await isAllowed(entity, "update", user, existing))) continue;
      const payload = sanitizePayload(entity, rest);
      payload.updated_at = new Date();
      const keys = Object.keys(payload);
      const rows = await sql`UPDATE ${sql(table)} SET ${sql(payload, ...keys)} WHERE id = ${id} RETURNING *`;
      updated.push(rows[0]);
    }
    return json(updated);
  }

  // ---- DELETE: DELETE /api/entities/:name/:id ----
  if (req.method === "DELETE" && sub) {
    const existing = await fetchRow(table, sub);
    if (!existing) return json({ error: "Not found" }, 404);
    if (!(await isAllowed(entity, "delete", user, existing))) return json({ error: "Forbidden" }, 403);
    await sql`DELETE FROM ${sql(table)} WHERE id = ${sub}`;
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
