import {
  addPendingPhoto,
  getPendingPhoto,
  getPendingPhotosByCatch,
  getAllPendingPhotos,
  removePendingPhoto,
  updatePendingPhoto,
  getAllCatches,
} from "@/lib/localDb";
import { updateCatchPhoto } from "@/lib/catchRepository";
import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/imageCompression";

// Save a photo to the local gallery (IndexedDB) — returns the pending photo ID
// catchId links the photo to a catch upfront (no timestamp matching needed)
// The file is compressed first (~100-150KB target) so the local copy and the
// eventual cloud copy are the same small size — see imageCompression.js.
export async function savePendingPhoto(file, cloudUrl = null, catchId = null) {
  // A catch only ever shows its LATEST photo. If picking a new one here
  // (e.g. on the edit screen, see EditCatch.jsx's handlePhoto) supersedes an
  // earlier pick for the same catch that hasn't uploaded yet, drop that old
  // pending record now — otherwise it would still get uploaded later by
  // uploadAllPendingPhotos() (which uploads every pending photo regardless
  // of whether something newer replaced it) and become a permanent orphan:
  // nothing ever ends up pointing at it, since the catch's photo_url only
  // ever gets set to whichever upload finishes last. Already-"uploading"
  // ones are left alone (can't cancel mid-flight) — updateCatchPhoto below
  // GCs those server-side once they land, if they turn out superseded.
  if (catchId) {
    try {
      const superseded = await getPendingPhotosByCatch(catchId);
      for (const old of superseded) {
        if (old.status !== "uploading") await removePendingPhoto(old.id);
      }
    } catch {
      // best-effort — worst case the stale pick still uploads and gets
      // cleaned up afterward instead of skipped upfront
    }
  }

  const compact = await compressImage(file);
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await addPendingPhoto({
    id,
    catch_id: catchId,
    catch_created_date: null,
    created_date: new Date().toISOString(),
    blob: compact,
    status: cloudUrl ? "uploaded" : "pending",
    cloud_url: cloudUrl,
  });
  return id;
}

// Try to upload a photo to the cloud, return URL or null. Compresses to
// ~100-150KB first — the photo is stored directly in Postgres server-side
// (server/routes/catchPhotos.ts), so keeping it small matters for fitting a
// large number of catches inside a free-tier database.
export async function uploadPhotoToCloud(file) {
  const compact = await compressImage(file);
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: compact });
  return file_url;
}

// v3.151 — a photo whose status is "uploading" was being sent when the page was
// closed / the browser killed / the phone locked: nothing ever set it back, and
// both uploadPendingPhoto() and uploadAllPendingPhotos() skip "uploading" ones,
// so it stayed on the device forever (the catch then had no photo on the server
// or on the other devices) although the connection was fine afterwards. An
// "uploading" record older than this is treated as interrupted and retried; at
// start-up every such record is reset at once (see the bottom of the file).
const UPLOADING_STALE_MS = 2 * 60 * 1000;
function isActiveUpload(item) {
  if (!item || item.status !== "uploading") return false;
  return Date.now() - (item.uploading_since || 0) < UPLOADING_STALE_MS;
}

// Upload a single pending photo and update the linked catch
export async function uploadPendingPhoto(item) {
  if (!item || isActiveUpload(item)) return null;

  // If already uploaded to cloud, just link to catch
  if (item.cloud_url) {
    if (item.catch_id) {
      const linked = await updateCatchPhoto(item.catch_id, item.catch_created_date, item.cloud_url);
      if (!linked) {
        // v3.81 — second, independent safety net (see markCatchSynced() in
        // localDb.js for the primary fix). catch_id didn't resolve to any
        // local catch — most likely caught mid-rename from a local_ ID to
        // its real server ID. The cloud copy already exists; leave the
        // pending record in place (instead of discarding it) so the next
        // sync pass retries just this cheap link step, rather than the
        // photo being permanently lost from both the queue and the catch.
        await updatePendingPhoto(item.id, { status: "pending" });
        return null;
      }
    }
    await removePendingPhoto(item.id);
    return item.cloud_url;
  }

  await updatePendingPhoto(item.id, { status: "uploading", uploading_since: Date.now() });
  try {
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: item.blob });
    await updatePendingPhoto(item.id, { cloud_url: file_url });
    if (item.catch_id) {
      const linked = await updateCatchPhoto(item.catch_id, item.catch_created_date, file_url);
      if (!linked) {
        // Same v3.81 safety net as above, for the first-time upload path.
        console.warn(`Pending photo ${item.id} uploaded but catch ${item.catch_id} was not found yet; will retry linking`);
        await updatePendingPhoto(item.id, { status: "pending" });
        return file_url;
      }
    }
    await removePendingPhoto(item.id);
    return file_url;
  } catch (e) {
    console.error(`Failed to upload pending photo ${item.id}:`, e);
    await updatePendingPhoto(item.id, { status: "failed" });
    return null;
  }
}

// Upload all pending photos (called when online or manually).
// v3.151 — a photo that got linked to its catch marks the local catch as
// changed (photo_url); this used to be sent only by the NEXT full sync (next
// focus/app start), so right after closing a session the server could lack the
// photo links for a long time. Now the changed catches are pushed right away
// (push: false only for syncAll(), which pushes them itself).
export async function uploadAllPendingPhotos({ push = true } = {}) {
  const all = await getAllPendingPhotos();
  let linkedAny = false;
  for (const item of all) {
    if (!isActiveUpload(item)) {
      const result = await uploadPendingPhoto(item);
      if (result && item.catch_id) linkedAny = true;
    }
  }
  if (linkedAny && push) {
    try {
      const { pushOnly } = await import("@/lib/syncEngine");
      pushOnly();
    } catch {
      // the next full sync pushes them
    }
  }
}

// Sync unlinked photos: match pending photos to catches by timestamp, then upload
export async function syncUnlinkedPhotos() {
  const all = await getAllPendingPhotos();
  const unlinked = all.filter(p => !p.catch_id);
  if (unlinked.length === 0) return;

  const catches = await getAllCatches();
  if (catches.length === 0) return;

  for (const photo of unlinked) {
    const photoTime = new Date(photo.created_date).getTime();
    // Photo is saved at the same moment the catch is created — find the nearest catch by timestamp
    let bestMatch = null;
    let bestDiff = Infinity;
    for (const c of catches) {
      const catchTime = new Date(c.created_date || c.date).getTime();
      const diff = Math.abs(catchTime - photoTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = c;
      }
    }
    // Accept the nearest catch only if within 60 seconds (photo and catch are saved together)
    if (bestMatch && bestDiff < 60 * 1000) {
      await updatePendingPhoto(photo.id, {
        catch_id: bestMatch.id,
        catch_created_date: bestMatch.created_date,
      });
      const updated = await getPendingPhoto(photo.id);
      if (updated) {
        await uploadPendingPhoto(updated);
      }
    }
  }
}

// Re-export for UI components
export { getPendingPhotosByCatch };

// Remove orphaned pending photos (not linked to any catch and no cloud URL)
export async function cleanupOrphanedPendingPhotos() {
  const all = await getAllPendingPhotos();
  for (const item of all) {
    if (!item.catch_id && !item.cloud_url) {
      await removePendingPhoto(item.id);
    }
  }
}

// v3.151 — right after the page loads no upload of THIS page can be running, so
// whatever is still marked "uploading" was interrupted: make it retryable now.
async function resetInterruptedUploads() {
  try {
    const all = await getAllPendingPhotos();
    for (const item of all) {
      if (item.status === "uploading") await updatePendingPhoto(item.id, { status: "pending", uploading_since: null });
    }
  } catch {
    // best-effort
  }
}

// Auto-upload when back online
if (typeof window !== "undefined") {
  resetInterruptedUploads();
  window.addEventListener("online", () => {
    setTimeout(() => uploadAllPendingPhotos(), 1000);
  });
}