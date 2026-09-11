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

// Save a photo to the local gallery (IndexedDB) — returns the pending photo ID
// catchId links the photo to a catch upfront (no timestamp matching needed)
export async function savePendingPhoto(file, cloudUrl = null, catchId = null) {
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await addPendingPhoto({
    id,
    catch_id: catchId,
    catch_created_date: null,
    created_date: new Date().toISOString(),
    blob: file,
    status: cloudUrl ? "uploaded" : "pending",
    cloud_url: cloudUrl,
  });
  return id;
}

// Try to upload a photo to the cloud, return URL or null
export async function uploadPhotoToCloud(file) {
  const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: file });
  return file_url;
}

// Upload a single pending photo and update the linked catch
export async function uploadPendingPhoto(item) {
  if (!item || item.status === "uploading") return null;

  // If already uploaded to cloud, just link to catch
  if (item.cloud_url) {
    if (item.catch_id) {
      await updateCatchPhoto(item.catch_id, item.catch_created_date, item.cloud_url);
    }
    await removePendingPhoto(item.id);
    return item.cloud_url;
  }

  await updatePendingPhoto(item.id, { status: "uploading" });
  try {
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file: item.blob });
    await updatePendingPhoto(item.id, { cloud_url: file_url });
    if (item.catch_id) {
      await updateCatchPhoto(item.catch_id, item.catch_created_date, file_url);
    }
    await removePendingPhoto(item.id);
    return file_url;
  } catch (e) {
    console.error(`Failed to upload pending photo ${item.id}:`, e);
    await updatePendingPhoto(item.id, { status: "failed" });
    return null;
  }
}

// Upload all pending photos (called when online or manually)
export async function uploadAllPendingPhotos() {
  const all = await getAllPendingPhotos();
  for (const item of all) {
    if (item.status !== "uploading") {
      await uploadPendingPhoto(item);
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

// Auto-upload when back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setTimeout(() => uploadAllPendingPhotos(), 1000);
  });
}