// Saves a photo to the local gallery (IndexedDB) for offline viewing.
// Also serves as the pending upload queue for photos that failed cloud sync.

import { addPendingPhoto, getAllPendingPhotos, removePendingPhoto } from "@/lib/localDb";

// Save photo to local gallery (IndexedDB)
export async function savePhotoToGallery(cloudUrl, file) {
  const id = `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await addPendingPhoto({
    id,
    catch_id: null,
    catch_created_date: null,
    created_date: new Date().toISOString(),
    blob: file,
    status: cloudUrl ? "uploaded" : "pending",
    cloud_url: cloudUrl || null,
  });
  return id;
}

export async function getGalleryPhotos() {
  return await getAllPendingPhotos();
}

export async function deleteGalleryPhoto(id) {
  await removePendingPhoto(id);
}