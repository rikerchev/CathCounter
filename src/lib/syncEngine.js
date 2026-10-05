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
  mergeRemoteBait,
  getAllRodCasts,
  saveRodCastLocal,
  deleteRodCastLocal,
  mergeRemoteRodCasts
} from "@/lib/localDb";

let syncing = false;
let pendingReRun = false;
let listeners = [];
let isOnline = navigator.onLine;

// Initialize online status listeners
if (typeof window !== "undefined") {
  // A flaky mobile connection can fire several "online" events in a quick
  // burst while it reconnects. Without debouncing, each one queued its own
  // full syncAll() right after the previous one finished, so the
  // "Синхронизиране..." pill could stay visible far longer than a single
  // sync actually takes, and the app felt stuck/slow.
  let onlineDebounceId = null;
  window.addEventListener("online", () => {
    isOnline = true;
    clearTimeout(onlineDebounceId);
    onlineDebounceId = setTimeout(() => syncAll(), 300);
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

// v3.108 — one row per press of "Старт" (see rodCastRepository.js). A cast
// is never edited after creation and never deleted by the user, so unlike
// pushPendingCatches/pushPendingBait this never needs the "update existing
// record" branch — every unsynced row is always a brand-new local_ one.
// Pulled with the server's own hard cap (1000, see entities.ts) rather than
// the 500 catches/bait use: casts accumulate far faster than catches (many
// per catch, often several per minute), so the usual window undercounts
// sooner.
export async function pullRemoteRodCasts() {
  try {
    const remoteCasts = await base44.entities.RodCast.list("-created_date", 1000);
    if (remoteCasts && remoteCasts.length > 0) {
      await mergeRemoteRodCasts(remoteCasts);
    }
    return remoteCasts || [];
  } catch (e) {
    console.error("pullRemoteRodCasts error:", e);
    return [];
  }
}

export async function pushPendingRodCasts() {
  const localCasts = await getAllRodCasts();
  const unsynced = localCasts.filter(c => !c._synced);

  for (const castItem of unsynced) {
    try {
      const { id, _synced, ...payload } = castItem;
      const created = await base44.entities.RodCast.create(payload);
      await saveRodCastLocal({ ...castItem, id: created.id, _synced: true });
      await deleteRodCastLocal(castItem.id);
    } catch (e) {
      console.error(`Failed to sync cast ${castItem.id}:`, e);
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
    await pushPendingRodCasts();
    await pushPendingDeletions();
  } catch (e) {
    console.error("pushOnly error:", e);
  } finally {
    syncing = false;
    notifyListeners();
    if (pendingReRun) {
      pendingReRun = false;
      // v3.79 — escalate the retry to a full syncAll() (was pushOnly()).
      // pushOnly() only pushes catches/bait/deletions; it never uploads
      // pending photos. A pushOnly() call that got deferred here because
      // another sync was already running, or the connection blipped offline
      // for a moment, used to only ever get a pushOnly() retry — so a photo
      // sitting in the pending-photo queue at that exact moment could go
      // uncovered by every retry this app ever runs, unless something else
      // (another catch save, a genuine "online" transition) happened to
      // trigger a real syncAll() later. Retrying with the full syncAll()
      // closes that gap: whatever was missed, including photos, gets a real
      // second chance.
      syncAll();
    }
  }
}

export async function syncAll() {
  if (syncing || !isOnline) {
    // v3.79 — previously this just silently returned with no retry at all,
    // unlike pushOnly() just above. A syncAll() call that lost this race
    // (called while another sync was still running, or right as the
    // connection was still registering as offline) used to vanish
    // completely — the pending photo(s) it would have uploaded then had to
    // wait for some unrelated future trigger (another catch save, or a
    // fresh "online" event) to ever get another chance. Now it leaves the
    // same breadcrumb pushOnly() already did, so the sync that's currently
    // running (or the next one that actually goes through) picks it back up
    // instead of dropping it.
    pendingReRun = true;
    return;
  }
  syncing = true;
  notifyListeners();

  try {
    // 1. Push local changes first — these touch independent local stores, so
    // run them in parallel instead of one after another. On a slow/mobile
    // connection this alone can cut the visible "Синхронизиране..." time
    // roughly in half to a third.
    await Promise.all([
      pushPendingCatches(),
      pushPendingBait(),
      pushPendingRodCasts(),
      pushPendingDeletions(),
    ]);

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

    // 3. Pull remote updates — also independent, also parallel
    await Promise.all([
      pullRemoteCatches(),
      pullRemoteBait(),
      pullRemoteRodCasts(),
    ]);
  } catch (e) {
    console.error("syncAll error:", e);
  } finally {
    syncing = false;
    notifyListeners();
    if (pendingReRun) {
      pendingReRun = false;
      // v3.79 — was pushOnly(); see the note on pushOnly()'s own retry above.
      // A syncAll() that gets superseded here also needs the retry to be a
      // real syncAll(), not a lighter pushOnly() that skips photos.
      syncAll();
    }
  }
}

// v3.79 — safety net for the case the "online" event alone doesn't cover:
// the app was closed or fully backgrounded (screen off/locked) while
// offline, connectivity came back while nothing was there to react to it,
// and the user then reopens/refocuses the app already "online" — so no
// online→offline→online transition ever fires within this page's
// lifetime for the existing listeners below to catch. Mirrors the
// visibilitychange+focus pattern already used elsewhere in this app (see
// useRodTimerMonitor.js, NotificationsBell.jsx) rather than inventing a new
// one. Throttled so flipping between apps/tabs repeatedly doesn't fire a
// real network sync every single time.
const MIN_VISIBILITY_SYNC_INTERVAL_MS = 15000;
let lastVisibilitySyncAt = 0;

if (typeof window !== "undefined") {
  const onVisibilityOrFocus = () => {
    if (document.hidden || !isOnline) return;
    const now = Date.now();
    if (now - lastVisibilitySyncAt < MIN_VISIBILITY_SYNC_INTERVAL_MS) return;
    lastVisibilitySyncAt = now;
    syncAll();
  };
  document.addEventListener("visibilitychange", onVisibilityOrFocus);
  window.addEventListener("focus", onVisibilityOrFocus);
}

// Auto-sync on startup if online
export function initSync() {
  if (isOnline) {
    // v2.69 — was 2000ms. This is the heaviest of the background fetches
    // (Catch/Bait, up to 500 rows each) and used to land right on top of
    // every page's own primary fetch plus NotificationsBell's and the ad
    // banner's, all competing for the single DB connection a serverless
    // instance holds (`max: 1`, see server/db.ts). That burst was enough to
    // push some requests — Catch and Bait included — past the client's 12s
    // timeout even though the server would have answered given more time.
    // Pushed later, after those (now also staggered — see
    // NotificationsBell.jsx and useEligibleAds.js) have had a chance to
    // finish first.
    setTimeout(() => syncAll(), 6000);
  }
}