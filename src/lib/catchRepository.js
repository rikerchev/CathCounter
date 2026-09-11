// Local catch repository: all reads go through local DB, writes go local-first
import { getAllCatches, getCatch as getCatchLocal, saveCatchLocal, deleteCatchLocal } from "@/lib/localDb";
import { addPendingSync } from "@/lib/localDb";
import { syncAll, pushOnly } from "@/lib/syncEngine";

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
  if (!String(id).startsWith("local_")) {
    await addPendingSync({ type: "delete_catch", entityId: id });
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
    record.photo_url = photoUrl;
    record._synced = false;
    await saveCatchLocal(record);
    pushOnly();
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