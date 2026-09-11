import { sql } from "../db.ts";
import type { AccessRule, EntityDef } from "../schema/entities.generated.ts";
import type { AuthUser } from "./auth.ts";
import { isAdmin } from "./auth.ts";

/**
 * Mirrors the access described in each base44/entities/*.jsonc `rls` string.
 * An admin always passes every check — that matches how the original app's
 * admin pages behave (e.g. AdminDataExport reads/writes every entity, and
 * User.jsonc explicitly says admins can manage all users).
 *
 * `row` is only needed for update/delete (to check ownership of an existing
 * row) and is omitted for list/create checks.
 */
export async function isAllowed(
  entity: EntityDef,
  action: "read" | "create" | "update" | "delete",
  user: AuthUser | null,
  row?: Record<string, unknown> | null,
): Promise<boolean> {
  const isAdminUser = isAdmin(user);
  if (isAdminUser) return true;

  const rule: AccessRule = entity.rules[action];

  switch (rule.kind) {
    case "public":
      return true;

    case "authenticated":
      return Boolean(user);

    case "admin_only":
      return false; // admins already returned true above

    case "owner": {
      if (!user) return false;
      if (!row) return true; // create: enforced by forcing the field server-side, not a block
      return row[rule.field] === user.id;
    }

    case "relation_owner": {
      if (!user) return false;
      const fkValue = row ? row[rule.fk] : undefined;
      if (row && !fkValue) return false;
      // For create, the fk value lives in the incoming payload, not `row`;
      // callers pass it in via `row` for both create and update checks.
      const rows = await sql`
        SELECT created_by_id FROM ${sql(rule.table)} WHERE id = ${fkValue}
      `;
      return rows[0]?.created_by_id === user.id;
    }

    case "owner_or_relation": {
      if (!user) return false;
      if (row && row[rule.field] === user.id) return true;
      const fkValue = row ? row[rule.fk] : undefined;
      if (!fkValue) return false;
      const rows = await sql`
        SELECT created_by_id FROM ${sql(rule.table)} WHERE id = ${fkValue}
      `;
      return rows[0]?.created_by_id === user.id;
    }

    default:
      return false;
  }
}
