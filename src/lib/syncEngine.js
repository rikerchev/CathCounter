// Sync engine: pushes local changes to Base44 and pulls remote updates
import { base44 } from "@/api/base44Client";
import {
  getAllCatches,
  saveCatchLocal,
  deleteCatchLocal,
  markCatchSynced,
  getPendingSync,
  removePendingSync,
  mergeRemoteCatches,
  getAllBait,
  saveBaitLocal,
  deleteBaitLocal,
  mergeRemoteBait
} from "@/lib/localDb";

let syncing = false;
let pendingReRun = false;
let listeners = [];
let isOnline = navigator.onLine;

// Initialize online status listeners
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    isOnline = true;
    syncAll();
  });
  window.addEventListener("offline", () => {
    isOnline = false;
    notifyListeners();
  });
}

export function onSyncChange(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach(l => l({ isOnline, syncing }));
}

export function getOnlineStatus() {
  return isOnline;
}

export async function pullRemoteCatches() {
  try {
    const remoteCatches = await base44.entities.Catch.list("-created_date", 500);
    if (remoteCatches && remoteCatches.length > 0) {
      await mergeRemoteCatches(remoteCatches);
    }
    return remoteCatches || [];
  } catch (e) {
    console.error("pullRemoteCatches error:", e);
    return [];
  }
}

export async function pullRemoteBait() {
  try {
    const remoteBait = await base44.entities.Bait.list("-created_date", 500);
    if (remoteBait && remoteBait.length > 0) {
      await mergeRemoteBait(remoteBait);
    }
    return remoteBait || [];
  } catch (e) {
    console.error("pullRemoteBait error:", e);
    return [];
  }
}

export async function pushPendingCatches() {
  const localCatches = await getAllCatches();
  const unsynced = localCatches.filter(c => !c._synced);

  for (const catchItem of unsynced) {
    try {
      // Check if it's a local-only record (starts with "local_")
      const isLocal = String(catchItem.id).startsWith("local_");
      const { id, _synced, ...payload } = catchItem;

      if (isLocal) {
        // Create new record remotely
        const created = await base44.entities.Catch.create(payload);
        await markCatchSynced(catchItem.id, created.id, catchItem.updated_date);
      } else {
        // Update existing record
        await base44.entities.Catch.update(catchItem.id, payload);
        await saveCatchLocal({ ...catchItem, _synced: true });
      }
    } catch (e) {
      console.error(`Failed to sync catch ${catchItem.id}:`, e);
    }
  }
}

export async function pushPendingBait() {
  const localBait = await getAllBait();
  const unsynced = localBait.filter(b => !b._synced);

  for (const baitItem of unsynced) {
    try {
      const isLocal = String(baitItem.id).startsWith("local_");
      const { id, _synced, ...payload } = baitItem;

      if (isLocal) {
        const created = await base44.entities.Bait.create(payload);
        await saveBaitLocal({ ...baitItem, id: created.id, _synced: true });
        await deleteBaitLocal(baitItem.id);
      } else {
        await base44.entities.Bait.update(baitItem.id, payload);
        await saveBaitLocal({ ...baitItem, _synced: true });
      }
    } catch (e) {
      console.error(`Failed to sync bait ${baitItem.id}:`, e);
    }
  }
}

export async function pushPendingDeletions() {
  const pending = await getPendingSync();
  for (const op of pending) {
    try {
      if (op.type === "delete_catch") {
        if (!String(op.entityId).startsWith("local_")) {
          await base44.entities.Catch.delete(op.entityId);
        }
        await removePendingSync(op.id);
      } else if (op.type === "delete_bait") {
        if (!String(op.entityId).startsWith("local_")) {
          await base44.entities.Bait.delete(op.entityId);
        }
        await removePendingSync(op.id);
      }
    } catch (e) {
      console.error(`Failed to sync deletion ${op.entityId}:`, e);
    }
  }
}

// Push-only sync: fast, used after local saves so the UI doesn't wait for a full pull
export async function pushOnly() {
  if (syncing || !isOnline) {
    pendingReRun = true;
    return;
  }
  syncing = true;
  notifyListeners();
  try {
    await pushPendingCatches();
    await pushPendingBait();
    await pushPendingDeletions();
  } catch (e) {
    console.error("pushOnly error:", e);
  } finally {
    syncing = false;
    notifyListeners();
    if (pendingReRun) {
      pendingReRun = false;
      pushOnly();
    }
  }
}

export async function syncAll() {
  if (syncing || !isOnline) return;
  syncing = true;
  notifyListeners();

  try {
    // 1. Push local changes first
    await pushPendingCatches();
    await pushPendingBait();
    await pushPendingDeletions();

    // 2. Upload pending photos (sets photo_url on local catches, marks them unsynced)
    try {
      const { uploadAllPendingPhotos, syncUnlinkedPhotos } = await import("@/lib/pendingPhotos");
      await syncUnlinkedPhotos();
      await uploadAllPendingPhotos();
    } catch (e) {
      console.error("pushPendingPhotos error:", e);
    }

    // 2b. Push catches that got photo_url from photo uploads (pushOnly was blocked by syncing flag)
    await pushPendingCatches();

    // 3. Pull remote updates
    await pullRemoteCatches();
    await pullRemoteBait();
  } catch (e) {
    console.error("syncAll error:", e);
  } finally {
    syncing = false;
    notifyListeners();
    if (pendingReRun) {
      pendingReRun = false;
      pushOnly();
    }
  }
}

// Auto-sync on startup if online
export function initSync() {
  if (isOnline) {
    setTimeout(() => syncAll(), 2000);
  }
}