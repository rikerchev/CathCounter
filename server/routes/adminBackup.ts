import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";
import { findOrCleanOrphanedPhotos } from "../lib/photoGc.js";
import { absoluteUrl } from "../lib/url.js";
import { env } from "../env.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Full-database backup/restore (Admin → Data Export → "Глобален
// експорт/импорт"). Every table covered by it, EXCEPT catch_photos (handled
// separately below — its `data` BYTEA column is far too large for a plain
// JSON row and needs base64 encoding, batched client-side).
//
// Deliberately excluded: otp_codes — short-lived, hashed one-time codes with
// no value once expired; restoring old ones has no benefit and is a small
// security smell.
//
// This exact list is also what gets wiped together on restore (see
// restore/begin below) — every FK among these tables (and catch_photos) is
// `ON DELETE SET NULL` onto users(id) (see schema.sql), so listing every one
// of them together in a single TRUNCATE is both necessary (Postgres refuses
// to truncate a table something else still references, unless that
// something is truncated in the same statement) and sufficient (no CASCADE
// needed) — as long as this list stays in sync with schema.sql. A future
// table with a FK the schema adds and this list forgets will surface as a
// clear TRUNCATE error rather than silently vanishing data, which is why
// this intentionally does NOT use TRUNCATE ... CASCADE.
export const BACKUP_TABLES = [
  "users",
  "app_settings",
  "ad_slots",
  "ad_slot_requests",
  "app_languages",
  "baits",
  "base_items",
  "catches",
  "competitions",
  "competition_registrations",
  "custom_ads",
  "menu_groups",
  "notifications",
  "role_requests",
  "sector_availabilities",
  "sector_reservations",
  "session_syncs",
  "subscriptions",
  "translations",
  "user_inventories",
  "water_bodies",
] as const;

function isBackupTable(name: string): name is typeof BACKUP_TABLES[number] {
  return (BACKUP_TABLES as readonly string[]).includes(name);
}

/**
 * GET  /api/admin/backup/manifest              -> row counts (for a progress UI)
 * GET  /api/admin/backup/table/:name            -> { rows } full table dump
 * GET  /api/admin/backup/photos-list             -> { rows } catch_photos METADATA only (no bytes —
 *   the client fetches each photo's actual bytes from the existing, already-public
 *   GET /api/catch-photos/:id, exactly like the per-user export in dataPortability.js does)
 * POST /api/admin/backup/restore/begin           -> wipes every table below, all at once
 * POST /api/admin/backup/restore/table/:name     body={rows:[...]} -> bulk-inserts rows verbatim
 *   (ids, timestamps, everything — this is a raw restore, not the normal create-with-defaults path)
 * POST /api/admin/backup/restore/photos          body={photos:[{id,mime_type,size_bytes,
 *   created_by_id,created_at,data_base64}]} -> bulk-inserts catch_photos rows
 * GET  /api/admin/backup/orphaned-photos          -> { count } of unused catch_photos rows
 * POST /api/admin/backup/orphaned-photos/cleanup   -> deletes them, { deleted }
 *
 * All of the above are admin-only. This deliberately reads/writes full raw
 * rows (e.g. users.password_hash, users.google_id, app_settings secret
 * values) — a real database backup has to, to actually be restorable — so
 * every response here is more sensitive than the normal /api/entities
 * surface and must never be reachable by a non-admin.
 */
export async function handleAdminBackupRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  if (req.method === "GET" && path[0] === "manifest") {
    // One combined query instead of 22 sequential round trips — matters
    // because server/router.ts caps the whole request at 20s, and a slow
    // Supabase connection (see db.ts) makes 22 sequential queries add up
    // fast. Safe as sql.unsafe: every table name here is one of the
    // hardcoded constants above, never request input.
    const allTables = [...BACKUP_TABLES, "catch_photos"];
    const unionQuery = allTables
      .map((t) => `SELECT '${t}' AS t, COUNT(*)::int AS n FROM ${t}`)
      .join(" UNION ALL ");
    const counts = (await sql.unsafe(unionQuery)) as { t: string; n: number }[];
    const byTable = new Map(counts.map((r) => [r.t, r.n]));
    const tables: Record<string, number> = {};
    for (const t of BACKUP_TABLES) tables[t] = byTable.get(t) ?? 0;
    return json({ tables, photos: byTable.get("catch_photos") ?? 0 });
  }

  if (req.method === "GET" && path[0] === "table" && path[1]) {
    const name = path[1];
    if (!isBackupTable(name)) return json({ error: "Unknown table" }, 400);
    // No ORDER BY here on purpose: row order doesn't matter for a backup,
    // and not every backed-up table has a created_at column (app_settings
    // only has key/value/updated_at) — a hardcoded ORDER BY created_at would
    // break that one table's export.
    const rows = await sql`SELECT * FROM ${sql(name)}`;
    return json({ rows });
  }

  if (req.method === "GET" && path[0] === "photos-list") {
    const rows = await sql`
      SELECT id, mime_type, size_bytes, created_by_id, created_at
      FROM catch_photos ORDER BY created_at ASC
    `;
    return json({ rows });
  }

  if (req.method === "POST" && path[0] === "restore" && path[1] === "begin") {
    const allTables = [...BACKUP_TABLES, "catch_photos"];
    // See the BACKUP_TABLES comment above for why this is a single
    // multi-table TRUNCATE with no CASCADE. The table names are 100%
    // hardcoded above (never request input), so sql.unsafe here is safe —
    // same pattern as scripts/migrate.ts.
    await sql.unsafe(`TRUNCATE TABLE ${allTables.join(", ")}`);
    return json({ success: true });
  }

  if (req.method === "POST" && path[0] === "restore" && path[1] === "table" && path[2]) {
    const name = path[2];
    if (!isBackupTable(name)) return json({ error: "Unknown table" }, 400);
    const body = await req.json().catch(() => ({ rows: [] }));
    const rows: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return json({ inserted: 0 });
    const keys = Object.keys(rows[0]);
    if (keys.length === 0) return json({ inserted: 0 });
    await sql`INSERT INTO ${sql(name)} ${sql(rows, ...keys)}`;
    return json({ inserted: rows.length });
  }

  // GET  /api/admin/backup/orphaned-photos          -> { count } — preview only, deletes nothing
  // POST /api/admin/backup/orphaned-photos/cleanup   -> { deleted } — actually deletes them
  //
  // "Orphaned" = a catch_photos row nothing references anymore: see
  // server/lib/photoGc.ts. This happens two ways — replacing a catch's
  // photo with a new one, or deleting a catch that had one — both of which
  // now clean up automatically going forward (see entities.ts). This is for
  // the backlog that piled up before that existed.
  if (req.method === "GET" && path[0] === "orphaned-photos") {
    const ids = await findOrCleanOrphanedPhotos(true);
    return json({ count: ids.length });
  }

  if (req.method === "POST" && path[0] === "orphaned-photos" && path[1] === "cleanup") {
    const ids = await findOrCleanOrphanedPhotos(false);
    return json({ deleted: ids.length });
  }

  // GET  /api/admin/backup/wrong-domain-photo-urls          -> { count } — preview only
  // POST /api/admin/backup/wrong-domain-photo-urls/fix       -> { updated }
  //
  // A batch of catches from 2026-09-12 got their photo_url stamped with a
  // misspelled host ("cath-counter.vercel.app" instead of
  // "catch-counter.vercel.app" — PUBLIC_API_URL or the request origin was
  // wrong for a while when catchPhotos.ts built the URL at upload time, see
  // src/lib/dataPortability.js's exportUserData for how this was found: the
  // global backup never noticed because it never fetches through this
  // stored string, but the personal "Улови и снимки" export — and the
  // in-app photo thumbnails (Thumbnail.jsx passes photo_url straight to an
  // external resizer) — do. Rather than special-case that one typo, this
  // re-derives the correct URL for EVERY catches.photo_url /
  // custom_ads.logo_url / ad_slot_requests.logo_url from the photo's own id
  // (same UUID-extraction approach as photoGc.ts/photoNaming.js) and the
  // server's current, correctly-configured origin — so it also self-heals
  // if the domain ever changes again, not just this one incident.
  // water_bodies/base_items are deliberately excluded: those columns are
  // normally hand-typed external URLs (see photoGc.ts), not uploads, so
  // touching them risks overwriting a legitimate unrelated URL.
  const NORMALIZE_TARGETS = [
    { table: "catches", column: "photo_url" },
    { table: "custom_ads", column: "logo_url" },
    { table: "ad_slot_requests", column: "logo_url" },
  ] as const;
  const PHOTO_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  async function findWrongDomainRows(origin: string) {
    const out: { table: string; column: string; id: string; correct: string }[] = [];
    for (const { table, column } of NORMALIZE_TARGETS) {
      const rows = (await sql.unsafe(
        `SELECT id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL`,
      )) as { id: string; val: string }[];
      for (const r of rows) {
        const m = r.val.match(PHOTO_ID_RE);
        if (!m) continue; // not a catch-photos URL at all (or unrecognized) — leave untouched
        const correct = `${origin}/api/catch-photos/${m[0]}`;
        if (correct !== r.val) out.push({ table, column, id: r.id, correct });
      }
    }
    return out;
  }

  if (req.method === "GET" && path[0] === "wrong-domain-photo-urls") {
    const origin = env.PUBLIC_API_URL || absoluteUrl(req).origin;
    const rows = await findWrongDomainRows(origin);
    return json({ count: rows.length });
  }

  if (req.method === "POST" && path[0] === "wrong-domain-photo-urls" && path[1] === "fix") {
    const origin = env.PUBLIC_API_URL || absoluteUrl(req).origin;
    const rows = await findWrongDomainRows(origin);
    for (const r of rows) {
      await sql.unsafe(`UPDATE ${r.table} SET ${r.column} = $1 WHERE id = $2`, [r.correct, r.id]);
    }
    return json({ updated: rows.length });
  }

  // GET  /api/admin/backup/unlinked-photos        -> proposals, changes nothing
  // POST /api/admin/backup/unlinked-photos/link   -> { links:[{photo_id,catch_id}] }
  //
  // v3.170 — "несвързани" photos: they ARE in catch_photos (uploaded by their
  // owner) but no catch points at them any more — the link got lost between
  // the device and the server (see claude/unlinked-photos-sync-race-fix-3.169).
  // The photo row keeps its owner (created_by_id) and upload time, so each one
  // can be matched to that owner's catches that still have NO photo, by the
  // time the catch was made (catches.date). Proposals only — the admin looks
  // at the thumbnails and confirms; applying re-checks everything server-side.
  const CATCH_BEFORE_UPLOAD_MS = 14 * 24 * 60 * 60 * 1000; // an offline catch can be uploaded days later
  const CLOCK_SKEW_MS = 10 * 60 * 1000;                     // device clock vs server clock
  const CONFIDENT_MS = 15 * 60 * 1000;
  const MAX_CANDIDATES = 15;

  function catchTime(c: { date?: unknown; created_at?: unknown }): number {
    const d = c.date;
    if (d) {
      let str = String(d);
      if (str.includes("T") && !str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) str += "Z";
      const t = Date.parse(str);
      if (!Number.isNaN(t)) return t;
    }
    return new Date(c.created_at as string).getTime();
  }

  if (req.method === "GET" && path[0] === "unlinked-photos") {
    const ids = await findOrCleanOrphanedPhotos(true);
    if (ids.length === 0) return json({ photos: [] });
    const photos = (await sql`
      SELECT id, created_by_id, created_at, size_bytes FROM catch_photos
      WHERE id IN ${sql(ids)} ORDER BY created_at ASC
    `) as unknown as { id: string; created_by_id: string | null; created_at: string; size_bytes: number }[];
    const owners = [...new Set(photos.map((p) => p.created_by_id).filter((x): x is string => !!x))];

    let users: { id: string; email: string; full_name: string | null }[] = [];
    let catchesByOwner = new Map<string, { id: string; t: number; species: unknown; weight: unknown; location: unknown; rod: unknown }[]>();
    if (owners.length) {
      users = (await sql`SELECT id, email, full_name FROM users WHERE id IN ${sql(owners)}`) as unknown as typeof users;
      const rows = (await sql`
        SELECT id, created_by_id, date, created_at, species, weight, location, water_name, rod
        FROM catches
        WHERE created_by_id IN ${sql(owners)} AND (photo_url IS NULL OR photo_url = '')
      `) as unknown as Record<string, any>[];
      for (const r of rows) {
        const list = catchesByOwner.get(r.created_by_id) ?? [];
        list.push({ id: r.id, t: catchTime(r), species: r.species, weight: r.weight, location: r.water_name || r.location, rod: r.rod });
        catchesByOwner.set(r.created_by_id, list);
      }
    }
    const userById = new Map(users.map((u) => [u.id, u]));

    // Candidates per photo + one-to-one greedy assignment by smallest time gap
    // (catch made BEFORE the upload; small tolerance for clock differences).
    type Pair = { photoId: string; catchId: string; diff: number };
    const pairs: Pair[] = [];
    const candidatesByPhoto = new Map<string, { id: string; t: number; species: unknown; weight: unknown; location: unknown; rod: unknown; diff: number }[]>();
    for (const p of photos) {
      if (!p.created_by_id) continue;
      const up = new Date(p.created_at).getTime();
      const cands = (catchesByOwner.get(p.created_by_id) ?? [])
        .map((c) => ({ ...c, diff: up - c.t }))
        .filter((c) => c.diff >= -CLOCK_SKEW_MS && c.diff <= CATCH_BEFORE_UPLOAD_MS)
        .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
        .slice(0, MAX_CANDIDATES);
      candidatesByPhoto.set(p.id, cands);
      for (const c of cands) pairs.push({ photoId: p.id, catchId: c.id, diff: Math.abs(c.diff) });
    }
    pairs.sort((a, b) => a.diff - b.diff);
    const proposal = new Map<string, Pair>();
    const takenCatches = new Set<string>();
    for (const pr of pairs) {
      if (proposal.has(pr.photoId) || takenCatches.has(pr.catchId)) continue;
      proposal.set(pr.photoId, pr);
      takenCatches.add(pr.catchId);
    }

    return json({
      photos: photos.map((p) => {
        const u = p.created_by_id ? userById.get(p.created_by_id) : undefined;
        const pr = proposal.get(p.id);
        return {
          id: p.id,
          created_at: p.created_at,
          size_bytes: p.size_bytes,
          owner: p.created_by_id ? { id: p.created_by_id, label: u?.full_name || u?.email || p.created_by_id } : null,
          proposal: pr ? pr.catchId : null,
          diff_min: pr ? Math.round(pr.diff / 60000) : null,
          confident: pr ? pr.diff <= CONFIDENT_MS : false,
          candidates: (candidatesByPhoto.get(p.id) ?? []).map((c) => ({
            id: c.id, t: c.t, species: c.species, weight: c.weight, location: c.location, rod: c.rod,
          })),
        };
      }),
    });
  }

  if (req.method === "POST" && path[0] === "unlinked-photos" && path[1] === "link") {
    const body = await req.json().catch(() => ({ links: [] }));
    const links: { photo_id?: string; catch_id?: string }[] = Array.isArray(body.links) ? body.links.slice(0, 300) : [];
    const unlinkedIds = new Set(await findOrCleanOrphanedPhotos(true));
    const origin = env.PUBLIC_API_URL || absoluteUrl(req).origin;
    let linked = 0;
    const skipped: { photo_id: string; reason: string }[] = [];
    for (const l of links) {
      const photoId = String(l.photo_id || "");
      const catchId = String(l.catch_id || "");
      if (!photoId || !catchId) continue;
      if (!unlinkedIds.has(photoId)) { skipped.push({ photo_id: photoId, reason: "снимката вече е свързана или не съществува" }); continue; }
      const photo = (await sql`SELECT created_by_id FROM catch_photos WHERE id = ${photoId}`) as unknown as { created_by_id: string | null }[];
      const owner = photo[0]?.created_by_id;
      if (!owner) { skipped.push({ photo_id: photoId, reason: "снимката няма собственик" }); continue; }
      // Same owner, and the catch must still have no photo (also protects
      // against two photos being sent to one catch).
      const url = `${origin}/api/catch-photos/${photoId}`;
      const done = (await sql`
        UPDATE catches SET photo_url = ${url}, updated_at = now()
        WHERE id = ${catchId} AND created_by_id = ${owner} AND (photo_url IS NULL OR photo_url = '')
        RETURNING id
      `) as unknown as { id: string }[];
      if (done.length) linked++;
      else skipped.push({ photo_id: photoId, reason: "уловът не е на същия потребител или вече има снимка" });
    }
    return json({ linked, skipped });
  }

  if (req.method === "POST" && path[0] === "restore" && path[1] === "photos") {
    const body = await req.json().catch(() => ({ photos: [] }));
    const photos: Array<{
      id: string;
      mime_type: string;
      size_bytes: number;
      created_by_id: string | null;
      created_at: string;
      data_base64: string;
    }> = Array.isArray(body.photos) ? body.photos : [];
    for (const p of photos) {
      const data = Buffer.from(p.data_base64, "base64");
      await sql`
        INSERT INTO catch_photos (id, data, mime_type, size_bytes, created_by_id, created_at)
        VALUES (${p.id}, ${data}, ${p.mime_type}, ${p.size_bytes}, ${p.created_by_id}, ${p.created_at})
      `;
    }
    return json({ inserted: photos.length });
  }

  return json({ error: "Not found" }, 404);
}
