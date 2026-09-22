import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";
import { ROLE_GROUP_KEYS, findRoleGroupId } from "../lib/roleGroups.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Never return password_hash / google_id to the client, no matter who's asking.
// premium_until (v2.68) added for the Admin Users list. Same code-deploys-
// before-the-button-is-clicked gap as middleware/auth.ts's getUserFromRequest
// (see that file's comment) — this endpoint hits it just as easily (every
// load of Admin → Управление на потребители), so it needs the identical
// try-the-new-column-first-then-fall-back treatment, via withSafeColumns()
// below, instead of assuming the migration has already run.
//
// v3.18 — `phone` (the users.phone column, migrated back in v3.03 and
// already load-bearing everywhere else — PhoneGate.jsx blocks the whole app
// until it's set) was never added to either column list here, so the admin
// Users screen (AdminUsers.jsx) had no way to show it even though the data
// has existed since v3.03/v3.05. Added to both tiers directly (not a third
// fallback tier) since a deployment this far past v3.05 can safely assume
// that migration has already run — the app would already be broken
// elsewhere (PhoneGate) if it hadn't.
const SAFE_COLUMNS_FULL = `
  id, email, full_name, phone, role, roles, country, menu_group_id,
  email_verified, created_at, updated_at, premium_until
`;
const SAFE_COLUMNS_BASE = `
  id, email, full_name, phone, role, roles, country, menu_group_id,
  email_verified, created_at, updated_at
`;

// Runs `run` with the full (premium_until-included) column list; if that
// fails specifically because the column doesn't exist yet, retries once
// with the pre-v2.68 column list instead of 500ing the whole page.
async function withSafeColumns<T>(run: (columns: string) => Promise<T>): Promise<T> {
  try {
    return await run(SAFE_COLUMNS_FULL);
  } catch (e) {
    if (e instanceof Error && /premium_until/.test(e.message)) {
      return await run(SAFE_COLUMNS_BASE);
    }
    throw e;
  }
}

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
    const rows = await withSafeColumns((cols) => sql`SELECT ${sql.unsafe(cols)} FROM users ORDER BY created_at DESC`);
    return json(rows);
  }

  // ---- FILTER: POST /api/entities/User/filter  (body = { id } | { email } | ...) ----
  if (req.method === "POST" && sub === "filter") {
    const criteria = await req.json().catch(() => ({}));
    if (!isAdminUser && criteria.id !== user.id) return json({ error: "Forbidden" }, 403);

    let rows = await withSafeColumns((cols) => sql`SELECT ${sql.unsafe(cols)} FROM users`);
    rows = rows.filter((r: Record<string, unknown>) =>
      Object.entries(criteria).every(([k, v]) => r[k] === v)
    );
    return json(rows);
  }

  // ---- GET ONE: GET /api/entities/User/:id ----
  if (req.method === "GET" && sub) {
    if (!isAdminUser && sub !== user.id) return json({ error: "Forbidden" }, 403);
    const rows = await withSafeColumns((cols) => sql`SELECT ${sql.unsafe(cols)} FROM users WHERE id = ${sub}`);
    if (!rows.length) return json({ error: "Not found" }, 404);
    return json(rows[0]);
  }

  // ---- UPDATE: PUT/PATCH /api/entities/User/:id (admin only) ----
  if ((req.method === "PUT" || req.method === "PATCH") && sub) {
    if (!isAdminUser) return json({ error: "Forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const payload: Record<string, unknown> = {};
    for (const k of WRITABLE_COLUMNS) if (k in body) payload[k] = body[k];

    // v3.29 — the first time this request grants "water_owner" or
    // "advertiser" (i.e. it's newly present in the incoming roles[] and
    // wasn't already on the row) and the caller isn't ALSO explicitly
    // setting menu_group_id itself (a deliberate manual pick always wins),
    // auto-assign the account into that role's shared system group — see
    // server/lib/roleGroups.ts. Only when the account has no group of its
    // own yet, so this never reshuffles an existing (auto or manual)
    // assignment. Every screen that grants these roles (AdminRoleRequests,
    // AdminTraders, AdminWaterBodies, AdminUsers' per-role toggle) goes
    // through this exact endpoint, so hooking it here once covers all of
    // them — current and future.
    if (Array.isArray(payload.roles) && !("menu_group_id" in body)) {
      const beforeRows = await sql<{ roles: string[] | null; role: string | null; menu_group_id: string | null }[]>`
        SELECT roles, role, menu_group_id FROM users WHERE id = ${sub}
      `;
      const before = beforeRows[0];
      if (before && !before.menu_group_id) {
        const beforeRoles = new Set(before.roles ?? []);
        if (before.role) beforeRoles.add(before.role);
        const incomingRoles = payload.roles as string[];
        const newlyGranted = ROLE_GROUP_KEYS.find((r) => incomingRoles.includes(r) && !beforeRoles.has(r));
        if (newlyGranted) {
          const groupId = await findRoleGroupId(newlyGranted);
          if (groupId) payload.menu_group_id = groupId;
        }
      }
    }

    payload.updated_at = new Date();
    const keys = Object.keys(payload);
    const rows = await withSafeColumns((cols) => sql`
      UPDATE users SET ${sql(payload, ...keys)} WHERE id = ${sub}
      RETURNING ${sql.unsafe(cols)}
    `);
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
