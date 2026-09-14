import { sql } from "../db.js";

// Every column that can hold a /api/catch-photos/:id URL — i.e. every place
// a photo uploaded through base44.integrations.Core.UploadFile can end up
// referenced (see src/api/base44Client.js's uploadFile(), which always
// posts to /api/catch-photos regardless of caller: catch photos AND ad
// logos both go through it). water_bodies.logo_url and base_items.image_url
// are normally hand-typed external URLs (no upload UI currently sets
// either through /api/catch-photos), but are included here too as a
// harmless safety net in case an admin ever pastes a catch-photos URL into
// one of them — without this, a future/manual use of either column could
// have its photo wrongly swept up as "orphaned" and deleted.
//
// A photo is "orphaned" (safe to delete) only when NONE of these still
// reference it.
const REFERENCE_CHECKS = [
  { table: "catches", column: "photo_url" },
  { table: "custom_ads", column: "logo_url" },
  { table: "ad_slot_requests", column: "logo_url" },
  { table: "water_bodies", column: "logo_url" },
  { table: "base_items", column: "image_url" },
] as const;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractPhotoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(UUID_RE);
  return m ? m[0] : null;
}

/**
 * Deletes ONE catch_photos row by id, but only if nothing still references
 * it (see REFERENCE_CHECKS above). Safe to call speculatively — call this
 * with a photo's OLD url right after the row that used to point at it has
 * already been updated/deleted, so the check sees the up-to-date state.
 * Returns true if the photo was actually deleted.
 */
export async function gcPhotoId(id: string): Promise<boolean> {
  // Built from the hardcoded REFERENCE_CHECKS list above (never request
  // input), so sql.unsafe here is safe — same reasoning as the
  // BACKUP_TABLES-driven queries in adminBackup.ts.
  const notExists = REFERENCE_CHECKS
    .map(({ table, column }) => `NOT EXISTS (SELECT 1 FROM ${table} WHERE ${column} LIKE '%' || cp.id || '%')`)
    .join(" AND ");
  const rows = await sql.unsafe(
    `DELETE FROM catch_photos cp WHERE cp.id = $1 AND ${notExists} RETURNING cp.id`,
    [id],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Convenience wrapper: extracts the id from a /api/catch-photos/:id URL first. */
export async function gcPhotoUrl(url: string | null | undefined): Promise<boolean> {
  const id = extractPhotoId(url);
  if (!id) return false;
  return gcPhotoId(id);
}

/**
 * Finds every catch_photos row nothing references anymore (see
 * REFERENCE_CHECKS above) — used by the admin "Изчисти неизползвани снимки"
 * action in AdminDataExport.jsx. `dryRun` only counts/lists ids; otherwise
 * the rows are actually deleted.
 */
export async function findOrCleanOrphanedPhotos(dryRun: boolean): Promise<string[]> {
  const notExists = REFERENCE_CHECKS
    .map(({ table, column }) => `NOT EXISTS (SELECT 1 FROM ${table} WHERE ${column} LIKE '%' || cp.id || '%')`)
    .join(" AND ");
  const query = dryRun
    ? `SELECT cp.id FROM catch_photos cp WHERE ${notExists}`
    : `DELETE FROM catch_photos cp WHERE ${notExists} RETURNING cp.id`;
  const rows = (await sql.unsafe(query)) as { id: string }[];
  return rows.map((r) => r.id);
}
