// Local catch repository: all reads go through local DB, writes go local-first
import { getAllCatches, getCatch as getCatchLocal, saveCatchLocal, deleteCatchLocal } from "@/lib/localDb";
import { addPendingSync } from "@/lib/localDb";
import { syncAll, pushOnly } from "@/lib/syncEngine";
import { base44 } from "@/api/base44Client";
import { extractPhotoId } from "@/lib/photoNaming";

export async function listCatches() {
  const catches = await getAllCatches();
  return catches.sort((a, b) => {
    const dateA = a.date || a.created_date || "";
    const dateB = b.date || b.created_date || "";
    return dateB.localeCompare(dateA);
  });
}

export async function getCatch(id) {
  return await getCatchLocal(id);
}

export async function saveCatch(catchItem) {
  const saved = await saveCatchLocal({ ...catchItem, _synced: false });
  // Push-only: fast, no full pull that would slow down the UI
  pushOnly();
  return saved;
}

export async function deleteCatch(id) {
  const isLocalOnly = String(id).startsWith("local_");
  if (!isLocalOnly) {
    await addPendingSync({ type: "delete_catch", entityId: id });
  } else {
    // This catch never reached the server, so the normal
    // delete-on-server -> photo cleanup hook (server/routes/entities.ts)
    // never runs for it. Its photo can still have been uploaded to the
    // cloud already though — uploadAllPendingPhotos() (pendingPhotos.js)
    // uploads as soon as a photo is linked to a catch, independent of
    // whether that catch itself has synced yet. Without this, deleting the
    // catch at this point would orphan that photo forever. gcIfOrphaned is
    // safe to call speculatively: it only deletes if truly unreferenced.
    const record = await getCatchLocal(id);
    const photoId = extractPhotoId(record?.photo_url);
    if (photoId) {
      base44.catchPhotos.gcIfOrphaned(photoId).catch(() => {
        // best-effort — a leftover unused photo is harmless, don't block
        // or fail the actual deletion over this
      });
    }
  }
  await deleteCatchLocal(id);
  pushOnly();
}

export async function deleteSession(catches) {
  for (const c of catches) {
    await deleteCatch(c.id);
  }
}

export async function updateCatchPhoto(id, createdDate, photoUrl) {
  let record = await getCatchLocal(id);
  if (!record && createdDate) {
    const all = await getAllCatches();
    record = all.find(c => c.created_date === createdDate);
  }
  if (record) {
    const oldPhotoUrl = record.photo_url;
    record.photo_url = photoUrl;
    record._synced = false;
    await saveCatchLocal(record);
    pushOnly();

    // Best-effort GC of the photo this just replaced, right away — don't
    // wait for the sync push + server-side entities.ts hook. Covers photo
    // edits that overlap (pick photo A, then B, before A's upload even
    // finishes — see savePendingPhoto's own dedup in pendingPhotos.js for
    // the not-yet-uploaded case; this is the already-uploaded case). Safe
    // even if the server hasn't received this update yet: gcIfOrphaned only
    // deletes when NOTHING still references the photo, checked live.
    if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
      const oldPhotoId = extractPhotoId(oldPhotoUrl);
      if (oldPhotoId) {
        base44.catchPhotos.gcIfOrphaned(oldPhotoId).catch(() => {
          // best-effort — leftover unused photo is harmless
        });
      }
    }
  }
}

export async function updateCatchLocation(id, createdDate, location, latitude, longitude) {
  let record = await getCatchLocal(id);
  if (!record && createdDate) {
    const all = await getAllCatches();
    record = all.find(c => c.created_date === createdDate);
  }
  if (record) {
    record.location = location;
    record.latitude = latitude;
    record.longitude = longitude;
    record._synced = false;
    await saveCatchLocal(record);
    pushOnly();
  }
}

export async function listCatchesByUser(userId) {
  const catches = await getAllCatches();
  return catches
    .filter(c => !userId || !c.created_by_id || c.created_by_id === userId)
    .sort((a, b) => {
      const dateA = a.date || a.created_date || "";
      const dateB = b.date || b.created_date || "";
      return dateB.localeCompare(dateA);
    });
}