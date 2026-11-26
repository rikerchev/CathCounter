import { sql } from "../db.js";
import { absoluteUrl } from "../lib/url.js";
import { ENTITIES } from "../schema/entities.generated.js";
import type { EntityDef } from "../schema/entities.generated.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";
import { isAllowed } from "../middleware/authorize.js";
import { handleUserEntityRoute } from "./userEntity.js";
import { gcPhotoUrl } from "../lib/photoGc.js";

// Best-effort cleanup of a catch's OLD photo, called only after the row
// that used to point at it has already been updated/deleted — never lets a
// GC failure fail the actual request, since a leftover unused photo is
// harmless (just wasted space), while breaking a save/delete over it would
// not be. Scoped to entityName === "Catch" by every caller below: catches
// are the only entity whose photo_url this app ever overwrites/removes in
// place (ad logos are edited through their own admin flows, not this one).
async function gcOldCatchPhoto(oldPhotoUrl: unknown): Promise<void> {
  if (typeof oldPhotoUrl !== "string" || !oldPhotoUrl) return;
  try {
    await gcPhotoUrl(oldPhotoUrl);
  } catch (e) {
    console.error("gcOldCatchPhoto error:", e);
  }
}

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

// v3.123 — a column the code knows about (entities.generated.ts) but the
// database does not have yet (a migration that hasn't been applied) would make
// every INSERT/UPDATE that includes it fail with a 500 — in v3.120 that made
// every catch carrying the new water_name/feeder2 fields impossible to sync
// until the migration ran. Fields whose column doesn't exist yet are dropped
// instead, so a deploy can never break saving; once the migration is applied
// they start being stored (the column list is re-read every minute).
const dbColumnsCache = new Map<string, { cols: Set<string>; at: number }>();

// v3.173 — catches.air_pressure is created on first use, so a forgotten
// migration can never cost the value: without the column it would be stripped
// below, and the next pull would then wipe it from the device as well.
let catchAirPressureEnsured: Promise<void> | null = null;
function ensureCatchAirPressureColumn(): Promise<void> {
  if (!catchAirPressureEnsured) {
    catchAirPressureEnsured = Promise.resolve(
      sql.unsafe(`ALTER TABLE catches ADD COLUMN IF NOT EXISTS air_pressure DOUBLE PRECISION`),
    )
      .then(() => {
        dbColumnsCache.delete("catches");
      })
      .catch((e) => {
        console.warn("[entities] could not add catches.air_pressure:", e);
      });
  }
  return catchAirPressureEnsured;
}

async function stripMissingColumns(
  table: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (table === "catches" && "air_pressure" in payload) await ensureCatchAirPressureColumn();
  try {
    let entry = dbColumnsCache.get(table);
    if (!entry || Date.now() - entry.at > 60_000) {
      const rows = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      entry = { cols: new Set(rows.map((r) => r.column_name)), at: Date.now() };
      dbColumnsCache.set(table, entry);
    }
    if (entry.cols.size === 0) return payload;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) if (entry.cols.has(k)) out[k] = v;
    return out;
  } catch {
    return payload;
  }
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

// v3.144 — entities whose list/filter is limited to the caller's own rows even
// for an admin. SessionSync holds each account's live fishing session (timers,
// rods); the app takes "the active row" from the list, so an admin's list used
// to contain other users' sessions and could load one of them as its own.
const ALWAYS_OWNER_SCOPED = new Set(["SessionSync"]);

// v3.150 — a fishing session nobody has touched for 10 h (no catch recorded,
// and it started more than 10 h ago) is dead: the app closes it by itself at
// that point. An OLDER app version that is still open somewhere (its JS only
// updates on reload) keeps writing its stale local session into the account's
// SessionSync row, and every other device then loaded it again (e.g. a 272 h
// timer). Enforced here so it also protects against clients that were never
// updated: such a write is ignored, and a stale row that is already stored is
// deactivated the next time it is read.
const SESSION_DEAD_MS = 10 * 60 * 60 * 1000;

function isDeadSessionData(sessionData: unknown): boolean {
  if (typeof sessionData !== "string") return false;
  try {
    const d = JSON.parse(sessionData);
    if (!d || d.sessionStartTime == null) return false;
    const ref = Number(d.lastCatchTime) || Number(d.sessionStartTime);
    return !!ref && Date.now() - ref >= SESSION_DEAD_MS;
  } catch {
    return false;
  }
}

// Deactivates (and reports as inactive) every active SessionSync row whose
// stored session is dead.
async function deactivateDeadSessions(rows: Record<string, any>[]): Promise<Record<string, any>[]> {
  for (const r of rows) {
    if (r.is_active && isDeadSessionData(r.session_data)) {
      try {
        await sql`UPDATE session_syncs SET is_active = false WHERE id = ${r.id}`;
        r.is_active = false;
      } catch {
        // best-effort
      }
    }
  }
  return rows;
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
    const url = absoluteUrl(req);
    const sort = parseSort(url.searchParams.get("sort"));
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);

    let whereClause = sql``;
    const rule = entity.rules.read;
    if (rule.kind === "owner" && (!isAdmin(user) || ALWAYS_OWNER_SCOPED.has(entityName))) {
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
    if (entityName === "SessionSync") await deactivateDeadSessions(rows as unknown as Record<string, any>[]);
    return json(rows);
  }

  // ---- FILTER: POST /api/entities/:name/filter  (body = { field: value, ... }) ----
  if (req.method === "POST" && sub === "filter") {
    if (!(await isAllowed(entity, "read", user))) return json({ error: "Forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const criteria = sanitizePayload(entity, body);

    const rule = entity.rules.read;
    const scoped = rule.kind === "owner" && (!isAdmin(user) || ALWAYS_OWNER_SCOPED.has(entityName));

    // v3.167 — the ownership scope and the simple criteria (string / number /
    // boolean / null) are applied in SQL. This used to load the WHOLE table
    // (every user's catches, every device's session_data JSON) and filter in
    // memory — for every page that asks for "my" rows, and for the Admin Users
    // page twice — which got slower with every new user. Anything that cannot
    // be expressed (objects/arrays) and any SQL error (e.g. a value that does
    // not fit the column type) falls back to the old behaviour below.
    let rows: Record<string, any>[] | null = null;
    try {
      const conds: any[] = [];
      if (scoped) conds.push(sql`${sql(rule.field)} = ${user?.id ?? "___none___"}`);
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(criteria)) {
        if (v === null) conds.push(sql`${sql(k)} IS NULL`);
        else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") conds.push(sql`${sql(k)} = ${v}`);
        else rest[k] = v;
      }
      const where = conds.length ? sql`WHERE ${conds.reduce((a, b) => sql`${a} AND ${b}`)}` : sql``;
      rows = (await sql`SELECT * FROM ${sql(table)} ${where}`) as unknown as Record<string, any>[];
      if (Object.keys(rest).length) {
        rows = rows.filter((r) => Object.entries(rest).every(([k, v]) => r[k] === v));
      }
    } catch (e) {
      console.warn(`[entities] SQL filter fell back to in-memory for ${entityName}:`, (e as Error)?.message);
      rows = null;
    }
    if (rows === null) {
      let all = (await sql`SELECT * FROM ${sql(table)}`) as unknown as Record<string, any>[];
      if (scoped) all = all.filter((r) => r[rule.field] === user?.id);
      rows = all.filter((r) => Object.entries(criteria).every(([k, v]) => r[k] === v));
    }
    if (entityName === "SessionSync") {
      // a dead session is flipped to inactive here, so criteria such as
      // { is_active: true } must be applied again to what is returned
      await deactivateDeadSessions(rows);
      rows = rows.filter((r) => Object.entries(criteria).every(([k, v]) => r[k] === v));
    }
    return json(rows);
  }

  // ---- GET ONE: GET /api/entities/:name/:id ----
  if (req.method === "GET" && sub) {
    const row = await fetchRow(table, sub);
    if (!row) return json({ error: "Not found" }, 404);
    if (!(await isAllowed(entity, "read", user, row))) return json({ error: "Forbidden" }, 403);
    if (entityName === "SessionSync") await deactivateDeadSessions([row as unknown as Record<string, any>]);
    return json(row);
  }

  // ---- CREATE: POST /api/entities/:name ----
  if (req.method === "POST" && !sub) {
    const body = await req.json().catch(() => ({}));
    if (!(await isAllowed(entity, "create", user, body))) return json({ error: "Forbidden" }, 403);
    const payload = await stripMissingColumns(table, sanitizePayload(entity, body));
    payload.created_by_id = user?.id ?? null;
    // v3.150 — a dead (10 h+ untouched) session is stored as closed, never live.
    if (entityName === "SessionSync" && isDeadSessionData(payload.session_data)) payload.is_active = false;

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
      const payload = await stripMissingColumns(table, sanitizePayload(entity, rec));
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
    const payload = await stripMissingColumns(table, sanitizePayload(entity, body));
    // v2.90 — catch_results (the weigh-in results a competition is ranked
    // on) must only ever be entered by an admin or the competition's own
    // organizer, never by the registrant who merely submitted the
    // registration — even though CompetitionRegistration's `update` rule
    // (owner_or_relation) otherwise lets the registrant edit their own row.
    // The generic entity system has no per-field access rule (see
    // AccessRule above), so this one field gets a narrow, hand-written
    // carve-out instead of a whole new endpoint. Silently dropped rather
    // than rejecting the whole request, same tolerant style as sanitizePayload.
    if (entityName === "CompetitionRegistration" && "catch_results" in payload && !isAdmin(user)) {
      const compRows = await sql<{ created_by_id: string | null }[]>`
        SELECT created_by_id FROM competitions WHERE id = ${existing.competition_id}
      `;
      if (compRows[0]?.created_by_id !== user?.id) {
        delete payload.catch_results;
      }
    }
    // v3.150 — ignore a write that would (re)store a dead session as the live
    // one (an old app version pushing its stale local state); if the stored
    // row is itself such a leftover, close it.
    if (entityName === "SessionSync" && payload.is_active !== false && isDeadSessionData(payload.session_data)) {
      const stored = existing as unknown as Record<string, any>;
      await deactivateDeadSessions([stored]);
      return json(stored);
    }
    payload.updated_at = new Date();
    const keys = Object.keys(payload);
    if (keys.length === 0) return json(existing);
    const rows = await sql`
      UPDATE ${sql(table)} SET ${sql(payload, ...keys)} WHERE id = ${sub} RETURNING *
    `;
    // Only when the photo actually changed to a DIFFERENT one — editing any
    // other field of a catch leaves photo_url untouched (still equal to
    // itself) and never triggers this, so a catch never loses its photo
    // just because something else about it was edited.
    if (
      entityName === "Catch" &&
      "photo_url" in payload &&
      existing.photo_url &&
      existing.photo_url !== payload.photo_url
    ) {
      await gcOldCatchPhoto(existing.photo_url);
    }
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
      const payload = await stripMissingColumns(table, sanitizePayload(entity, rest));
      // v2.90 — same catch_results carve-out as the single-record UPDATE
      // branch above (see its comment): bulk-update is currently only used
      // by the draw/reset flows (assigned_sector/assigned_box), but nothing
      // stops a future or crafted call from smuggling catch_results through
      // here instead, so the same guard applies.
      if (entityName === "CompetitionRegistration" && "catch_results" in payload && !isAdmin(user)) {
        const compRows = await sql<{ created_by_id: string | null }[]>`
          SELECT created_by_id FROM competitions WHERE id = ${existing.competition_id}
        `;
        if (compRows[0]?.created_by_id !== user?.id) {
          delete payload.catch_results;
        }
      }
      payload.updated_at = new Date();
      const keys = Object.keys(payload);
      const rows = await sql`UPDATE ${sql(table)} SET ${sql(payload, ...keys)} WHERE id = ${id} RETURNING *`;
      updated.push(rows[0]);
      if (
        entityName === "Catch" &&
        "photo_url" in payload &&
        existing.photo_url &&
        existing.photo_url !== payload.photo_url
      ) {
        await gcOldCatchPhoto(existing.photo_url);
      }
    }
    return json(updated);
  }

  // ---- DELETE: DELETE /api/entities/:name/:id ----
  if (req.method === "DELETE" && sub) {
    const existing = await fetchRow(table, sub);
    if (!existing) return json({ error: "Not found" }, 404);
    if (!(await isAllowed(entity, "delete", user, existing))) return json({ error: "Forbidden" }, 403);
    await sql`DELETE FROM ${sql(table)} WHERE id = ${sub}`;
    if (entityName === "Catch" && existing.photo_url) {
      await gcOldCatchPhoto(existing.photo_url);
    }
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
