// IndexedDB wrapper for local-first catch storage
const DB_NAME = "catchcount_db";
const DB_VERSION = 2;
const CATCHES_STORE = "catches";
const PENDING_SYNC_STORE = "pending_sync";
const BAIT_STORE = "bait";
const PENDING_PHOTOS_STORE = "pending_photos";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CATCHES_STORE)) {
        const store = db.createObjectStore(CATCHES_STORE, { keyPath: "id" });
        store.createIndex("created_date", "created_date");
      }
      if (!db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
        db.createObjectStore(PENDING_SYNC_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(BAIT_STORE)) {
        db.createObjectStore(BAIT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PENDING_PHOTOS_STORE)) {
        const photoStore = db.createObjectStore(PENDING_PHOTOS_STORE, { keyPath: "id" });
        photoStore.createIndex("catch_id", "catch_id");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function getAllCatches() {
  const store = await tx(CATCHES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getCatch(id) {
  const store = await tx(CATCHES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCatchLocal(catchItem) {
  const store = await tx(CATCHES_STORE, "readwrite");
  const record = {
    ...catchItem,
    id: catchItem.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_date: catchItem.created_date || new Date().toISOString(),
    updated_date: new Date().toISOString(),
    _synced: catchItem._synced || false
  };
  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCatchLocal(id) {
  const store = await tx(CATCHES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBait() {
  const store = await tx(BAIT_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBaitLocal(baitItem) {
  const store = await tx(BAIT_STORE, "readwrite");
  const record = {
    ...baitItem,
    id: baitItem.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_date: baitItem.created_date || new Date().toISOString(),
    updated_date: new Date().toISOString(),
    _synced: baitItem._synced || false
  };
  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBaitLocal(id) {
  const store = await tx(BAIT_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingSync(operation) {
  const store = await tx(PENDING_SYNC_STORE, "readwrite");
  const record = {
    ...operation,
    created_date: new Date().toISOString()
  };
  return new Promise((resolve, reject) => {
    const request = store.add(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingSync() {
  const store = await tx(PENDING_SYNC_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingSync(id) {
  const store = await tx(PENDING_SYNC_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function markCatchSynced(localId, remoteId, originalUpdatedDate) {
  const store = await tx(CATCHES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve(null);
      // If the record was modified since we read it (e.g. photo_url added),
      // keep _synced=false so the update gets pushed to the server
      const wasModified = originalUpdatedDate && record.updated_date !== originalUpdatedDate;
      record.id = remoteId;
      record._synced = wasModified ? false : true;
      record.updated_date = new Date().toISOString();
      store.delete(localId);
      const putReq = store.put(record);
      putReq.onsuccess = async () => {
        // Re-link any pending photos that still reference the old local ID
        try {
          const photoStore = await tx(PENDING_PHOTOS_STORE, "readwrite");
          const photoGetAll = photoStore.getAll();
          photoGetAll.onsuccess = () => {
            const photos = photoGetAll.result || [];
            for (const p of photos) {
              if (p.catch_id === localId) {
                p.catch_id = remoteId;
                photoStore.put(p);
              }
            }
          };
        } catch (e) {
          console.error("Failed to re-link pending photos after sync:", e);
        }
        resolve(record);
      };
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function addPendingPhoto(item) {
  const store = await tx(PENDING_PHOTOS_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingPhoto(id) {
  const store = await tx(PENDING_PHOTOS_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingPhotosByCatch(catchId) {
  const store = await tx(PENDING_PHOTOS_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).filter(p => p.catch_id === catchId));
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPendingPhotos() {
  const store = await tx(PENDING_PHOTOS_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingPhoto(id) {
  const store = await tx(PENDING_PHOTOS_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updatePendingPhoto(id, fields) {
  const store = await tx(PENDING_PHOTOS_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve(null);
      Object.assign(record, fields);
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function replaceAllCatches(items) {
  const store = await tx(CATCHES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      const promises = items.map(item => {
        return new Promise((res, rej) => {
          const putReq = store.put({ ...item, _synced: true });
          putReq.onsuccess = () => res();
          putReq.onerror = () => rej(putReq.error);
        });
      });
      Promise.all(promises).then(resolve).catch(reject);
    };
    clearReq.onerror = () => reject(clearReq.error);
  });
}

export async function mergeRemoteCatches(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CATCHES_STORE, "readwrite");
    const store = tx.objectStore(CATCHES_STORE);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const existing = {};
      (getAllReq.result || []).forEach((c) => { existing[c.id] = c; });
      items.forEach(item => {
        const local = existing[item.id];
        if (!local) {
          store.put({ ...item, _synced: true });
        } else if (local._synced) {
          // Preserve local photo_url if remote doesn't have one
          const merged = { ...item, _synced: true };
          if (local.photo_url && !merged.photo_url) {
            merged.photo_url = local.photo_url;
          }
          store.put(merged);
        }
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function mergeRemoteBait(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BAIT_STORE, "readwrite");
    const store = tx.objectStore(BAIT_STORE);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const existing = {};
      (getAllReq.result || []).forEach((b) => { existing[b.id] = b; });
      items.forEach(item => {
        const local = existing[item.id];
        if (!local) {
          store.put({ ...item, _synced: true });
        } else if (local._synced) {
          store.put({ ...item, _synced: true });
        }
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// v3.27 — wipes every local-first store (catches, bait, pending sync
// operations, pending photos). This IndexedDB database is keyed only by
// browser (DB_NAME above is a single fixed name, not scoped per account),
// so on a shared device where more than one CatchCount account logs in over
// time, whatever the PREVIOUS account synced here would otherwise sit
// around and get shown to the NEXT account too — merge helpers like
// mergeRemoteBait/mergeRemoteCatches only ever add/update entries from the
// server's response, they never remove a local one that belongs to someone
// else. Called from AuthContext.jsx whenever the signed-in user's id
// differs from the last one seen on this device, and on logout, so no
// account's local data survives into another account's session here.
export async function clearAllLocalData() {
  const db = await openDB();
  const storeNames = [CATCHES_STORE, PENDING_SYNC_STORE, BAIT_STORE, PENDING_PHOTOS_STORE];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, "readwrite");
    storeNames.forEach((name) => transaction.objectStore(name).clear());
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function replaceAllBait(items) {
  const store = await tx(BAIT_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      const promises = items.map(item => {
        return new Promise((res, rej) => {
          const putReq = store.put({ ...item, _synced: true });
          putReq.onsuccess = () => res();
          putReq.onerror = () => rej(putReq.error);
        });
      });
      Promise.all(promises).then(resolve).catch(reject);
    };
    clearReq.onerror = () => reject(clearReq.error);
  });
}