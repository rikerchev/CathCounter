// Full-database backup/restore — every table (users, catches, ads, water
// bodies, settings, ...) together with every catch photo, as a single .zip
// the admin can download and later restore. Powers the "Глобален
// експорт/импорт" buttons in AdminDataExport.jsx.
//
// Unlike the per-user export in dataPortability.js (that one only ever adds
// records for the CURRENT user), a global RESTORE is destructive: it wipes
// every table covered by the backup and replaces it with the file's
// contents, exactly as a real database restore would. AdminDataExport.jsx
// is responsible for getting unambiguous confirmation before calling
// importGlobalBackup() — this file assumes that's already happened.
//
// Why so many small requests instead of one big export/import: Vercel
// Functions cap both the request body AND the response body of a single
// call at 4.5MB (https://vercel.com/docs/functions/limitations#request-body-size).
// Catch photos alone can exceed that in one shot, so every table is fetched
// separately (still comfortably under the cap for a site this size) and
// photos are fetched/restored in size-capped batches.
import JSZip from "jszip";
import { base44 } from "@/api/base44Client";
import { apiUrl } from "@/api/base44Client";
import { APP_VERSION } from "@/lib/version";
import { parseCatchDate } from "@/lib/dateUtils";
import { sessionNumbersByCatchId } from "@/lib/sessions";
import { catchPhotoFilename, logoPhotoFilename, unlinkedPhotoFilename, extractPhotoId } from "@/lib/photoNaming";

// Keep in sync with BACKUP_TABLES in server/routes/adminBackup.ts.
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
];

const MANIFEST_NAME = "manifest.json";
const PHOTOS_MANIFEST_NAME = "photos-manifest.json";
const ROWS_PER_RESTORE_REQUEST = 200;
// Stays comfortably under Vercel's 4.5MB request cap once base64-encoded
// (~33% bigger than the raw bytes).
const PHOTO_BATCH_BASE64_BYTES = 3 * 1024 * 1024;

function extFromMime(mime) {
  if (mime && mime.includes("png")) return "png";
  if (mime && mime.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Downloads a full backup .zip. Returns { tables, photosCount }.
 * `onProgress`, if given, is called with a short Bulgarian status string.
 */
export async function exportGlobalBackup(onProgress) {
  const manifest = await base44.admin.backup.manifest();
  const zip = new JSZip();
  const tablesFolder = zip.folder("tables");

  // Captured while looping over every table below, so photo filenames can
  // be built afterward from real data instead of a bare id — see
  // src/lib/photoNaming.js.
  let usersRows = [];
  let catchesRows = [];
  let customAdsRows = [];
  let adSlotRequestsRows = [];
  let waterBodiesRows = [];

  for (const name of BACKUP_TABLES) {
    onProgress?.(`Изтегляне на ${name}...`);
    const { rows } = await base44.admin.backup.table(name);
    tablesFolder.file(`${name}.json`, JSON.stringify(rows));
    if (name === "users") usersRows = rows;
    else if (name === "catches") catchesRows = rows;
    else if (name === "custom_ads") customAdsRows = rows;
    else if (name === "ad_slot_requests") adSlotRequestsRows = rows;
    else if (name === "water_bodies") waterBodiesRows = rows;
  }

  // ---- Lookups for human-recognizable photo filenames ----
  // A photo can be: linked to a catch (the common case — named after its
  // owner, session, and catch date/time), used as an ad/water-body logo
  // (custom_ads / ad_slot_requests / water_bodies .logo_url — every upload
  // goes through the same /api/catch-photos endpoint regardless of what
  // it's for, see base44Client.js's uploadFile()), or — normally empty
  // after running "Изчисти неизползвани снимки" — neither.
  const usersById = new Map(usersRows.map((u) => [u.id, u]));

  const photoIdToCatch = new Map();
  for (const c of catchesRows) {
    const id = extractPhotoId(c.photo_url);
    if (id) photoIdToCatch.set(id, c);
  }

  const photoIdToLogoLabel = new Map();
  for (const a of customAdsRows) {
    const id = extractPhotoId(a.logo_url);
    if (id) photoIdToLogoLabel.set(id, a.title || "обява");
  }
  for (const r of adSlotRequestsRows) {
    const id = extractPhotoId(r.logo_url);
    if (id) photoIdToLogoLabel.set(id, r.ad_title || r.advertiser_name || "обява");
  }
  for (const w of waterBodiesRows) {
    const id = extractPhotoId(w.logo_url);
    if (id) photoIdToLogoLabel.set(id, w.name || "воден басейн");
  }

  // Sessions are per-user (see src/lib/sessions.js), so group catches by
  // owner first, then compute each owner's own session numbering once.
  const catchesByUser = new Map();
  for (const c of catchesRows) {
    const uid = c.created_by_id || "__none__";
    if (!catchesByUser.has(uid)) catchesByUser.set(uid, []);
    catchesByUser.get(uid).push(c);
  }
  const sessionMapByUser = new Map();
  for (const [uid, list] of catchesByUser) sessionMapByUser.set(uid, sessionNumbersByCatchId(list));

  const { rows: photoMeta } = await base44.admin.backup.photosList();
  const photosFolder = zip.folder("photos");
  const photosManifest = [];
  let done = 0;
  for (const p of photoMeta) {
    done++;
    onProgress?.(`Изтегляне на снимки (${done}/${photoMeta.length})...`);
    const res = await fetch(apiUrl(`/api/catch-photos/${p.id}`));
    if (!res.ok) continue; // shouldn't happen, but don't let one bad photo abort the whole backup
    const blob = await res.blob();
    const ext = extFromMime(p.mime_type);

    let filename;
    const catchRow = photoIdToCatch.get(p.id);
    if (catchRow) {
      const ownerId = catchRow.created_by_id || "__none__";
      const owner = usersById.get(ownerId) || usersById.get(p.created_by_id);
      filename = catchPhotoFilename({
        user: owner,
        catchDate: parseCatchDate(catchRow),
        sessionNumber: sessionMapByUser.get(ownerId)?.get(catchRow.id),
        photoId: p.id,
        ext,
      });
    } else if (photoIdToLogoLabel.has(p.id)) {
      filename = logoPhotoFilename({
        label: photoIdToLogoLabel.get(p.id),
        uploadedAt: new Date(p.created_at),
        photoId: p.id,
        ext,
      });
    } else {
      filename = unlinkedPhotoFilename({ photoId: p.id, uploadedAt: new Date(p.created_at), ext });
    }

    const file = `photos/${filename}`;
    photosFolder.file(filename, blob);
    photosManifest.push({
      id: p.id,
      mime_type: p.mime_type,
      size_bytes: p.size_bytes,
      created_by_id: p.created_by_id,
      created_at: p.created_at,
      file,
    });
  }
  zip.file(PHOTOS_MANIFEST_NAME, JSON.stringify(photosManifest));

  zip.file(
    MANIFEST_NAME,
    JSON.stringify(
      {
        app: "CatchCount",
        app_version: APP_VERSION,
        exported_at: new Date().toISOString(),
        tables: manifest.tables,
        photos: photosManifest.length,
      },
      null,
      2,
    ),
  );

  onProgress?.("Стягане на архива...");
  const blob = await zip.generateAsync({ type: "blob" });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `catchcount-backup-${dateStr}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { tables: manifest.tables, photosCount: photosManifest.length };
}

/**
 * Reads a backup .zip's manifest without restoring anything — lets the
 * caller show what's in the file (row counts, photo count) before asking
 * for confirmation.
 */
export async function readGlobalBackupManifest(file) {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(MANIFEST_NAME);
  if (!entry) throw new Error("Невалиден файл — липсва manifest.json");
  return JSON.parse(await entry.async("string"));
}

/**
 * Wipes every backed-up table and restores them (plus every photo) from the
 * given .zip. DESTRUCTIVE — replaces ALL current data in those tables with
 * the file's contents. Callers must get explicit, unambiguous confirmation
 * from the admin before calling this (see AdminDataExport.jsx).
 *
 * `onProgress`, if given, is called with a short Bulgarian status string.
 * Returns { rowsRestored, photosCount }.
 */
export async function importGlobalBackup(file, { onProgress } = {}) {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file(MANIFEST_NAME);
  if (!manifestEntry) throw new Error("Невалиден файл — липсва manifest.json");

  onProgress?.("Изтриване на текущите данни...");
  await base44.admin.backup.restoreBegin();

  // `users` MUST be restored before every other table — everything else has
  // a foreign key onto users(id) (see schema.sql), so inserting e.g. catches
  // first would fail if their created_by_id doesn't exist yet.
  const orderedTables = ["users", ...BACKUP_TABLES.filter((t) => t !== "users")];
  let rowsRestored = 0;

  for (const name of orderedTables) {
    const entry = zip.file(`tables/${name}.json`);
    if (!entry) continue;
    const rows = JSON.parse(await entry.async("string"));
    if (!rows.length) continue;
    onProgress?.(`Възстановяване на ${name} (${rows.length})...`);
    for (let i = 0; i < rows.length; i += ROWS_PER_RESTORE_REQUEST) {
      const chunk = rows.slice(i, i + ROWS_PER_RESTORE_REQUEST);
      await base44.admin.backup.restoreTable(name, chunk);
      rowsRestored += chunk.length;
    }
  }

  let photosCount = 0;
  const photosManifestEntry = zip.file(PHOTOS_MANIFEST_NAME);
  if (photosManifestEntry) {
    const photosManifest = JSON.parse(await photosManifestEntry.async("string"));
    let batch = [];
    let batchBytes = 0;

    const flush = async () => {
      if (!batch.length) return;
      onProgress?.(`Възстановяване на снимки (${photosCount + batch.length}/${photosManifest.length})...`);
      await base44.admin.backup.restorePhotos(batch);
      photosCount += batch.length;
      batch = [];
      batchBytes = 0;
    };

    for (const p of photosManifest) {
      const fileEntry = zip.file(p.file);
      if (!fileEntry) continue;
      const data_base64 = await fileEntry.async("base64");
      batch.push({
        id: p.id,
        mime_type: p.mime_type,
        size_bytes: p.size_bytes,
        created_by_id: p.created_by_id,
        created_at: p.created_at,
        data_base64,
      });
      batchBytes += data_base64.length;
      if (batchBytes >= PHOTO_BATCH_BASE64_BYTES) await flush();
    }
    await flush();
  }

  return { rowsRestored, photosCount };
}
