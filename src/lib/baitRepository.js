// Local bait repository: all reads go through local DB, writes go local-first
import { getAllBait, saveBaitLocal, deleteBaitLocal } from "@/lib/localDb";
import { addPendingSync } from "@/lib/localDb";
import { syncAll } from "@/lib/syncEngine";

export async function listBait() {
  const bait = await getAllBait();
  return bait.sort((a, b) => {
    const dateA = a.created_date || "";
    const dateB = b.created_date || "";
    return dateB.localeCompare(dateA);
  });
}

export async function saveBait(baitItem) {
  const saved = await saveBaitLocal(baitItem);
  syncAll();
  return saved;
}

export async function deleteBait(id) {
  if (!String(id).startsWith("local_")) {
    await addPendingSync({ type: "delete_bait", entityId: id });
  }
  await deleteBaitLocal(id);
  syncAll();
}