// Personal data export/import: backs up a user's own catches (fishing
// "sessions" shown in Sessions.jsx are computed on the fly by grouping
// catches that are close together in time — see SESSION_GAP_MS there — there
// is no separate "session" record stored anywhere, so exporting catches +
// their photos is a complete backup; sessions reappear automatically once
// the catches are re-imported, since grouping only depends on each catch's
// own `date`) together with the photos attached to them, as a single .zip
// file the user can download and later re-import (same device, a new
// device, or after reinstalling).
import JSZip from "jszip";
import { listCatchesByUser, saveCatch } from "@/lib/catchRepository";
import { getPendingPhotosByCatch, savePendingPhoto } from "@/lib/pendingPhotos";
import { syncAll } from "@/lib/syncEngine";
import { apiUrl } from "@/api/base44Client";
import { APP_VERSION } from "@/lib/version";
import { parseCatchDate } from "@/lib/dateUtils";
import { sessionNumbersByCatchId } from "@/lib/sessions";
import { catchPhotoFilename, extractPhotoId } from "@/lib/photoNaming";

const MANIFEST_NAME = "manifest.json";
const CATCHES_NAME = "catches.json";

function extFromMime(mime) {
  if (mime && mime.includes("png")) return "png";
  if (mime && mime.includes("webp")) return "webp";
  return "jpg";
}

function mimeFromExt(filename) {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

// Not meaningful (or not safe) to carry over into a freshly-imported record
// — a new local id/created_by_id/sync state is assigned by saveCatch()
// itself, and photo_url would otherwise point at someone else's copy of the
// photo (or a URL that no longer resolves) instead of the one we re-upload.
const STRIP_ON_IMPORT = [
  "id",
  "created_by_id",
  "created_date",
  "updated_date",
  "_synced",
  "photo_file",
  "photo_url",
];

/**
 * Builds the export .zip and triggers a browser download. Returns
 * { catchesCount, photosCount }.
 *
 * `user` is the full logged-in user object (id, email, full_name) — used to
 * give exported photo filenames a recognizable name (see
 * src/lib/photoNaming.js): user + session number + the catch's own date/time,
 * instead of a bare number.
 */
export async function exportUserData(user) {
  const catches = await listCatchesByUser(user?.id);
  const zip = new JSZip();
  const photosFolder = zip.folder("photos");
  const sessionByCatchId = sessionNumbersByCatchId(catches);

  let photoCount = 0;
  const exportedCatches = [];

  for (const c of catches) {
    const entry = { ...c };
    delete entry._synced;

    let photoBlob = null;
    let photoMime = null;

    // NEVER fetch c.photo_url as stored — some older catches have a
    // *validly-shaped* absolute URL that's simply wrong: for a batch of
    // catches from 2026-09-12, PUBLIC_API_URL (or the request origin, see
    // catchPhotos.ts) was captured as the misspelled "cath-counter.vercel.app"
    // instead of "catch-counter.vercel.app" (this repo's own folder/name
    // typo — see D:\CatchCounter\CathCounter). It starts with "https://" so
    // an earlier version of this check (only rebuilding the URL when it
    // *didn't* look absolute) let it straight through to a doomed fetch
    // against the wrong host every time. globalBackup.js never had this bug
    // because it never fetches through catches.photo_url at all — it always
    // gets the photo's real id from catch_photos itself (photosList()) and
    // calls apiUrl() with that. Do the same thing here: always rebuild the
    // URL from the id extracted out of the stored string, and ignore
    // whatever host happens to be sitting in front of it.
    const photoId = extractPhotoId(c.photo_url);
    const photoFetchUrl = photoId ? apiUrl(`/api/catch-photos/${photoId}`) : null;
    if (photoFetchUrl) {
      try {
        const res = await fetch(photoFetchUrl);
        if (res.ok) {
          photoBlob = await res.blob();
          photoMime = photoBlob.type || res.headers.get("content-type");
        }
      } catch {
        // Not reachable right now (offline, or the server request timed
        // out) — the catch itself is still exported, just without a photo.
      }
    }
    if (!photoBlob) {
      // Not uploaded yet (still local-only) — take it from the local
      // pending-photos gallery instead of the network.
      try {
        const pending = await getPendingPhotosByCatch(c.id);
        if (pending.length && pending[0].blob) {
          photoBlob = pending[0].blob;
          photoMime = pending[0].blob.type;
        }
      } catch {
        // ignore — export the catch without a photo rather than fail
      }
    }

    if (photoBlob) {
      const filename = catchPhotoFilename({
        user,
        catchDate: parseCatchDate(c),
        sessionNumber: sessionByCatchId.get(c.id),
        photoId: c.id,
        ext: extFromMime(photoMime),
      });
      photosFolder.file(filename, photoBlob);
      entry.photo_file = `photos/${filename}`;
      photoCount++;
    }

    exportedCatches.push(entry);
  }

  zip.file(CATCHES_NAME, JSON.stringify(exportedCatches, null, 2));
  zip.file(
    MANIFEST_NAME,
    JSON.stringify(
      {
        app: "CatchCount",
        app_version: APP_VERSION,
        exported_at: new Date().toISOString(),
        catches_count: exportedCatches.length,
        photos_count: photoCount,
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `catchcount-export-${dateStr}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { catchesCount: exportedCatches.length, photosCount: photoCount };
}

/**
 * Loads a previously-exported .zip and re-creates its catches (and queues
 * their photos for upload) on the current account. Every catch gets a brand
 * new id — importing the same file twice will create duplicates, there is
 * no de-duplication (callers should warn about this before calling).
 *
 * `onConfirm`, if given, is awaited with { catchesCount, photosCount } read
 * from the file's manifest before anything is written; returning a falsy
 * value aborts the import and resolves with `null`.
 *
 * Returns { catchesCount, photosCount } actually imported.
 */
export async function importUserData(file, { onConfirm } = {}) {
  const zip = await JSZip.loadAsync(file);

  const catchesEntry = zip.file(CATCHES_NAME);
  if (!catchesEntry) {
    throw new Error("Невалиден файл — липсва catches.json");
  }
  const catches = JSON.parse(await catchesEntry.async("string"));
  if (!Array.isArray(catches)) {
    throw new Error("Невалиден файл — catches.json не е списък");
  }

  if (onConfirm) {
    let manifest = { catches_count: catches.length, photos_count: 0 };
    const manifestEntry = zip.file(MANIFEST_NAME);
    if (manifestEntry) {
      try {
        manifest = JSON.parse(await manifestEntry.async("string"));
      } catch {
        // fall back to the counts derived above
      }
    }
    const proceed = await onConfirm({
      catchesCount: manifest.catches_count ?? catches.length,
      photosCount: manifest.photos_count ?? 0,
    });
    if (!proceed) return null;
  }

  let importedCatches = 0;
  let importedPhotos = 0;

  for (const raw of catches) {
    const photoFile = raw.photo_file;
    const payload = { ...raw };
    for (const field of STRIP_ON_IMPORT) delete payload[field];

    const saved = await saveCatch(payload);
    importedCatches++;

    if (photoFile) {
      const photoEntry = zip.file(photoFile);
      if (photoEntry) {
        try {
          const arrayBuffer = await photoEntry.async("arraybuffer");
          const mime = mimeFromExt(photoFile);
          const blob = new File([arrayBuffer], `imported.${photoFile.split(".").pop()}`, { type: mime });
          await savePendingPhoto(blob, null, saved.id);
          importedPhotos++;
        } catch {
          // Photo in the archive couldn't be read — keep the catch itself,
          // just without its photo.
        }
      }
    }
  }

  // Best-effort immediate push; if offline, the existing background sync
  // (online listener / periodic sync) picks these up later exactly like any
  // other locally-created catch or photo.
  try {
    await syncAll();
  } catch {
    // non-blocking
  }

  return { catchesCount: importedCatches, photosCount: importedPhotos };
}
