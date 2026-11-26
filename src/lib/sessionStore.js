// Global session store: persists timer state across navigation.
// Uses timestamps so timers keep running even when the component unmounts.
import { base44 } from "@/api/base44Client";
import { defaultCompetition, pickBaseDay, MAX_COMPETITION_RODS } from "@/lib/competition";

const STORAGE_KEY = "catchcount_session";
const DEVICE_ID_KEY = "catchcount_device_id";

let state = loadState();
// When the stored state last really changed (before this page load).
const loadedUpdatedAt = Number(state && state.updatedAt) || 0;
const listeners = new Set();

// --- Cloud sync (cross-device session resume) ---
//
// v3.144 — only the caller's OWN SessionSync rows are used (for an admin the
// server used to list every user's rows), one row per account is reused, an
// idle device never writes, and a poll never overwrites local changes that are
// still waiting to be pushed.
//
// v3.147 — a device that had been left with a STALE running session (timers
// started hours/days ago, never closed) overwrote the live session of the other
// device the moment anything on it called persist() (e.g. an expired reminder
// being marked as fired) — the live timers then "escalated" to the stale ones.
// Now:
//  * every real change stamps state.updatedAt; the cloud row carries it;
//  * before a device may write, it reconciles with the cloud once (stale local
//    session -> the newer remote one is adopted, a session closed on another
//    device is closed here too);
//  * every write first checks the cloud row and yields to a newer remote
//    version instead of overwriting it;
//  * closing a session only deactivates the cloud row of THAT session, and a
//    stale local session is never auto-closed before the reconcile has run.
let cloudSessionId = null;
let cloudSyncTimer = null;
let crossDevicePollTimer = null;
let lastCloudUpdateDate = null;
// A push failed or was postponed (offline, not reconciled yet) — retried from
// the next poll; until it succeeds no remote state may overwrite ours.
let unpushed = false;
let reconciled = false; // the first comparison with the cloud succeeded
let reconcileSettled = false; // the first attempt finished (success or not)
let reconcilePromise = null;
const PENDING_CLOSE_KEY = "catchcount_pending_close";

// v3.181 — CLOSING A SESSION IS ONE GLOBAL EVENT.
//  * Sessions are identified by their start time. Every device remembers the
//    sessions it knows to be closed (CLOSED_KEY) and never adopts or writes one
//    again — a closed session can no longer come back from the cloud (it did when
//    the "closed" message to the cloud failed, e.g. on a 504, and another device
//    still held the old session).
//  * Closing resets this device at once. The OTHER devices are told only when
//    everything of the session has been uploaded (catches, casts, bait,
//    deletions, photos — or after CLOSE_WAIT_MS at the latest, so one stuck item
//    cannot keep a dead session alive on the other devices): a "closed" record
//    ({closed, sessionStartTime, closedAt}) replaces the cloud session. It is
//    retried after every sync, when the connection returns and from the poll.
//  * A device that sees such a record resets itself: its live session if it is
//    that session, and — if it is idle — any tackle/rod/groundbait settings that
//    were last changed BEFORE the close (leftovers must not carry into the next
//    session). Settings changed after the close are kept.
const CLOSED_KEY = "catchcount_closed_sessions";
const CLOSE_WAIT_MS = 30 * 60 * 1000;
const CLOSE_KICK_MIN_MS = 60 * 1000;

function readClosedList() {
  try {
    const a = JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function rememberClosed(start, closedAt) {
  if (start == null) return;
  const list = readClosedList();
  const e = list.find((x) => x.start === start);
  if (e) e.closedAt = Math.max(Number(e.closedAt) || 0, Number(closedAt) || 0);
  else list.push({ start, closedAt: Number(closedAt) || Date.now() });
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify(list.slice(-30)));
  } catch {
    // ignore
  }
}

function isClosedStart(start) {
  return start != null && readClosedList().some((x) => x.start === start);
}

function readPendingClose() {
  try {
    const raw = localStorage.getItem(PENDING_CLOSE_KEY);
    if (!raw) return null;
    if (raw[0] === "{") {
      const p = JSON.parse(raw);
      return p && p.start != null ? p : null;
    }
    // v3.180 and older stored just the start time
    const start = Number(raw);
    if (!start) return null;
    const p = { start, closedAt: Date.now() };
    localStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify(p));
    return p;
  } catch {
    return null;
  }
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "dev_unknown";
  }
}

function rowStamp(r) {
  return String((r && (r.updated_at || r.updated_date || r.created_at)) || "");
}

function parseData(row) {
  try {
    return JSON.parse(row.session_data);
  } catch {
    return null;
  }
}

// When this cloud version was last changed, in ms: the writing device's own
// stamp (state.updatedAt), else the row's server time.
function rowMs(row, data) {
  return Number(data && data.updatedAt) || Date.parse(rowStamp(row)) || 0;
}

function isValidState(d) {
  return !!d && typeof d === "object" && Array.isArray(d.rods) && d.rods.length > 0
    && d.rodTimers && typeof d.rodTimers === "object" && d.sessionStartTime != null;
}

function notify() {
  listeners.forEach((l) => l());
}

// v3.150 — a session nobody has touched for 10 h (no catch, or no start) is dead:
// checkAutoClose() would close it at once. A cloud copy like that is never
// adopted — an older app version still open on another device (its JS keeps
// running until the page/PWA is reloaded) keeps writing its stale session back
// into the cloud row, and adopting it brought the old timers (e.g. 272 h) back
// on every device again and again.
const STALE_SESSION_MS = 10 * 60 * 60 * 1000;
function isStaleSessionData(d) {
  if (!d || d.sessionStartTime == null) return false;
  const ref = d.lastCatchTime || d.sessionStartTime;
  return Date.now() - ref >= STALE_SESSION_MS;
}

// The caller's OWN session rows, newest update first. null = not signed in /
// request failed (the caller then does nothing).
async function fetchMyRows() {
  const me = await base44.auth.me().catch(() => null);
  if (!me || !me.id) return null;
  const rows = await base44.entities.SessionSync.list("-updated_at", 100);
  return (rows || [])
    .filter((r) => r.created_by_id === me.id)
    .sort((a, b) => (rowStamp(a) < rowStamp(b) ? 1 : rowStamp(a) > rowStamp(b) ? -1 : 0));
}

function adoptRemote(row, data) {
  state = data;
  cloudSessionId = row.id;
  lastCloudUpdateDate = rowStamp(row) || lastCloudUpdateDate;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  notify();
}

function resetLocalSession() {
  state = emptyState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  notify();
}

// Compares ONE cloud row with the local state. Returns "adopted" (the remote
// session replaced the local one), "closed" (the same session was closed on
// another device, so it is closed here too) or "keep" (local stays; a later
// push overwrites the remote version). localMs = when the local state last
// really changed.
function evaluateRemote(row, localMs) {
  if (!row || row.device_id === getDeviceId()) return "keep";
  const data = parseData(row);
  if (!data) return "keep";
  if (row.is_active) {
    if (!isValidState(data)) return "keep";
    if (isStaleSessionData(data)) return "keep";
    if (isClosedStart(data.sessionStartTime)) return "keep"; // v3.181 — closed sessions never come back
    if (state.sessionStartTime == null || rowMs(row, data) > localMs) {
      adoptRemote(row, data);
      return "adopted";
    }
    // Local is newer: remember this remote version as seen.
    lastCloudUpdateDate = rowStamp(row) || lastCloudUpdateDate;
    return "keep";
  }
  if (state.sessionStartTime != null && data.sessionStartTime === state.sessionStartTime) {
    resetLocalSession();
    return "closed";
  }
  return "keep";
}

// Settings of rods/groundbait that nobody has changed since a session was closed.
function hasLeftovers() {
  const rods = state.rods || [];
  return (
    rods.length > 1 ||
    rods.some((r) => r && r.config && Object.keys(r.config).length > 0) ||
    (state.mixedGroundbaits || []).length > 0
  );
}

// v3.182 — this device was told that its session was closed elsewhere (it may
// have been offline at the time). Only the LIVE state is reset; everything it
// recorded offline (catches, casts, photos) stays in its local store and is
// uploaded right now — it joins the session it belongs to by itself, because a
// session is not a stored record but is built from the catches' times and the
// casts' own session_start (see src/lib/sessions.js).
function pushOwnDataAfterRemoteClose() {
  import("@/lib/syncEngine")
    .then(async (m) => {
      if (await m.hasUnsyncedData()) await m.syncAll();
    })
    .catch(() => {});
}

// Applies the "closed" records among the account's cloud rows. Returns true when
// the local state was reset (live session closed elsewhere, or idle leftovers).
function applyClosures(rows) {
  let newest = 0;
  for (const r of rows) {
    if (r.is_active) continue;
    const d = parseData(r);
    if (!d || d.sessionStartTime == null) continue;
    const closedAt = Number(d.closedAt) || rowMs(r, d);
    rememberClosed(d.sessionStartTime, closedAt);
    if (state.sessionStartTime != null && d.sessionStartTime === state.sessionStartTime) {
      resetLocalSession();
      pushOwnDataAfterRemoteClose();
      return true;
    }
    if (closedAt > newest) newest = closedAt;
  }
  if (state.sessionStartTime == null && newest && hasLeftovers() && newest > (state.updatedAt || 0) + 1000) {
    resetLocalSession();
    return true;
  }
  return false;
}

async function retryPendingClose() {
  await finalizePendingClose(false);
}

let finalizing = false;
let lastKick = 0;

// Tells the other devices that the session closed here is over — but only when
// everything of it has been uploaded (see the v3.181 note at the top). Returns
// true when the "closed" record has been written. fromSync: called at the end of
// a sync, so it must not start another one.
export async function finalizePendingClose(fromSync = false) {
  const p = readPendingClose();
  if (!p || finalizing) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  finalizing = true;
  try {
    if (Date.now() - p.closedAt < CLOSE_WAIT_MS) {
      const eng = await import("@/lib/syncEngine");
      if (await eng.hasUnsyncedData()) {
        if (!fromSync && Date.now() - lastKick > CLOSE_KICK_MIN_MS) {
          lastKick = Date.now();
          eng.syncAll().catch(() => {});
        }
        return false;
      }
    }
    const rows = await fetchMyRows();
    if (rows === null) return false; // not signed in / request failed — retried later
    const body = {
      is_active: false,
      device_id: getDeviceId(),
      session_data: JSON.stringify({ closed: true, sessionStartTime: p.start, closedAt: p.closedAt }),
    };
    const ids = rows
      .filter((r) => {
        if (!r.is_active) return false;
        const d = parseData(r);
        return !d || d.sessionStartTime == null || d.sessionStartTime === p.start;
      })
      .map((r) => r.id);
    if (ids.length > 0) {
      await Promise.all(ids.map((id) => base44.entities.SessionSync.update(id, body)));
    } else if (!rows.some((r) => !r.is_active && (parseData(r) || {}).sessionStartTime === p.start && (parseData(r) || {}).closed)) {
      // no cloud row of that session is active any more (e.g. it was never pushed): the
      // record is still needed so idle devices clear their leftovers
      await base44.entities.SessionSync.create(body);
    }
    try {
      localStorage.removeItem(PENDING_CLOSE_KEY);
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false; // retried after the next sync / poll / reconnect
  } finally {
    finalizing = false;
  }
}

// First comparison with the cloud (see the v3.147 note above). Resolves to
// true when the remote session replaced the local one.
export function reconcileFromCloud() {
  if (reconciled) return Promise.resolve(false);
  if (reconcilePromise) return reconcilePromise;
  reconcilePromise = (async () => {
    let adopted = false;
    try {
      await retryPendingClose();
      const rows = await fetchMyRows();
      if (rows) {
        applyClosures(rows);
        const active = rows.find((r) => r.is_active);
        if (active) {
          cloudSessionId = active.id;
          // loadedUpdatedAt = when the local state last changed BEFORE this
          // page load: automatic persists made since then must not make a
          // stale session look "newer" than the live one.
          adopted = evaluateRemote(active, loadedUpdatedAt) === "adopted";
        }
        reconciled = true;
        if (adopted) unpushed = false;
        else if (unpushed && !cloudSyncTimer) syncToCloud();
      }
    } catch {
      // retried later
    }
    reconcileSettled = true;
    reconcilePromise = null;
    return adopted;
  })();
  return reconcilePromise;
}

async function pushStateToCloud() {
  const body = () => ({
    session_data: JSON.stringify(state),
    is_active: true,
    device_id: getDeviceId(),
  });
  if (cloudSessionId) {
    let row = null;
    try {
      row = await base44.entities.SessionSync.get(cloudSessionId);
    } catch (e) {
      if (e && e.status !== 404 && e.status !== 403) throw e;
      cloudSessionId = null; // row gone — look it up again below
    }
    if (row) {
      // Never overwrite a newer remote version (or a session closed there).
      if (evaluateRemote(row, state.updatedAt || 0) !== "keep") return "conflict";
      return base44.entities.SessionSync.update(cloudSessionId, body());
    }
  }
  const rows = await fetchMyRows();
  if (rows === null) return null; // not signed in
  const active = rows.find((r) => r.is_active);
  if (active && evaluateRemote(active, state.updatedAt || 0) !== "keep") return "conflict";
  const existing = active || rows[0];
  if (existing) {
    cloudSessionId = existing.id;
    return base44.entities.SessionSync.update(existing.id, body());
  }
  const created = await base44.entities.SessionSync.create(body());
  cloudSessionId = created.id;
  return created;
}

function syncToCloud() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    // An idle device (no running session) has nothing to mirror; writing its
    // empty default state would wipe the live session of the other device.
    // Closing a session is handled by finalizePendingClose().
    if (state.sessionStartTime == null) {
      unpushed = false;
      return;
    }
    // Not compared with the cloud yet: a stale local session must not be
    // written over the live one. Postpone; reconcile() pushes afterwards.
    if (!reconciled) {
      unpushed = true;
      reconcileFromCloud();
      return;
    }
    try {
      const saved = await pushStateToCloud();
      if (saved && saved !== "conflict" && rowStamp(saved)) lastCloudUpdateDate = rowStamp(saved);
      unpushed = false;
    } catch {
      // best-effort; retried from the next poll
      unpushed = true;
    }
  }, 3000);
}

export async function checkCloudSession() {
  try {
    const rows = await fetchMyRows();
    if (!rows) return null;
    const active = rows.find((s) => s.is_active);
    if (active) {
      cloudSessionId = active.id;
      // Don't prompt if it's the same device
      if (active.device_id === getDeviceId()) return null;
      return active;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resumeFromCloud(cloudSession) {
  try {
    const data = JSON.parse(cloudSession.session_data);
    if (!isValidState(data)) return false;
    adoptRemote(cloudSession, data);
    return true;
  } catch {
    return false;
  }
}

// --- Continuous cross-device sync ---
// Polls the account's own cloud session every CROSS_DEVICE_POLL_MS for changes
// from other devices (a newer version is adopted, a session closed there is
// closed here), so timers/rods are mirrored.
//
// v3.47 — was 10s; 30s. v3.144 — 15s while the page is visible: the whole
// point of this poll is the two-device mirror. Hidden/locked pages skip the
// request entirely (see startCrossDeviceSync).
const CROSS_DEVICE_POLL_MS = 15000;

async function pollCrossDeviceOnce() {
  try {
    if (!reconciled) {
      await reconcileFromCloud();
      return;
    }
    // A failed push is retried here first; merging waits until it succeeded.
    if (unpushed && !cloudSyncTimer) syncToCloud();
    if (cloudSyncTimer || unpushed) return;
    await retryPendingClose();
    const rows = await fetchMyRows();
    if (!rows) return;
    // Local changes made while the request was running win this round.
    if (cloudSyncTimer || unpushed) return;
    applyClosures(rows);
    const active = rows.find((r) => r.is_active);
    if (active) {
      cloudSessionId = active.id;
      const result = evaluateRemote(active, state.updatedAt || 0);
      // Another device (typically an older app version still open there) wrote
      // an OLDER or stale session over this live one: put ours back.
      if (result === "keep" && state.sessionStartTime != null && active.device_id !== getDeviceId()) {
        const data = parseData(active);
        if (!data || isStaleSessionData(data) || rowMs(active, data) < (state.updatedAt || 0) - 2000) {
          unpushed = true;
          syncToCloud();
        }
      }
      return;
    }
  } catch {
    // Silently fail — cross-device sync is best-effort
  }
}

// Immediate check (page opened): reconcile first, then one poll.
export function syncNow() {
  return pollCrossDeviceOnce();
}

// A running session found in storage may be stale (left over from an earlier
// trip, or already replaced on another device): compare it with the cloud soon
// after start-up, before anything can write it over the live one.
if (typeof window !== "undefined" && state.sessionStartTime != null) {
  [1000, 5000, 15000, 45000, 90000].forEach((ms) =>
    setTimeout(() => {
      if (!reconciled) reconcileFromCloud();
    }, ms)
  );
  window.addEventListener("online", () => {
    if (!reconciled) reconcileFromCloud();
  });
}

// v3.181 — a close that has not reached the cloud yet is retried after start-up
// and whenever the connection returns (also after every sync, see syncEngine.js).
if (typeof window !== "undefined") {
  if (readPendingClose()) {
    [2000, 10000, 30000, 90000].forEach((ms) => setTimeout(() => finalizePendingClose(false), ms));
  }
  window.addEventListener("online", () => {
    if (readPendingClose()) finalizePendingClose(false);
  });
}

let crossDeviceVisibilityHandler = null;

export function startCrossDeviceSync() {
  if (crossDevicePollTimer) return;
  crossDevicePollTimer = setInterval(() => {
    // Skip this round's network round-trip while the tab/app isn't visible
    // (phone locked, another app in front) — nobody is there to see a merged
    // update anyway, and the visibilitychange handler below does one
    // immediate poll the instant it becomes visible again, so nothing is
    // missed, it just isn't fetched while unwatched.
    if (typeof document !== "undefined" && document.hidden) return;
    pollCrossDeviceOnce();
  }, CROSS_DEVICE_POLL_MS);

  if (typeof document !== "undefined") {
    crossDeviceVisibilityHandler = () => {
      if (!document.hidden) pollCrossDeviceOnce();
    };
    document.addEventListener("visibilitychange", crossDeviceVisibilityHandler);
  }
}

export function stopCrossDeviceSync() {
  if (crossDevicePollTimer) {
    clearInterval(crossDevicePollTimer);
    crossDevicePollTimer = null;
  }
  if (crossDeviceVisibilityHandler) {
    document.removeEventListener("visibilitychange", crossDeviceVisibilityHandler);
    crossDeviceVisibilityHandler = null;
  }
}

function emptyState() {
  return {
    sessionStartTime: null,
    rods: [{ id: 1, config: {} }],
    rodTimers: {}, // { [rodId]: { startTime, accumulated, isRunning, reminderMinutes, reminderStartTime, reminderTriggered } }
    mixedGroundbaits: [], // [{ name, grams }]
    lastCatchTime: null,
    lastCatchLocation: null, // { name, lat, lng } — the last precise GPS fix
    // confirmed for a catch this session (see recordCatchLocation below).
    competition: defaultCompetition(), // v3.158 — "Състезание" mode
    updatedAt: Date.now(), // v3.147 — last real change, ms (cross-device compare)
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return emptyState();
}

function persist(touch = true) {
  // v3.147 — only real changes stamp the state (automatic ones, e.g. marking a
  // reminder as fired, must not make an old state look newer than a live one).
  if (touch) state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
  syncToCloud();
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Session timer ---

export function ensureSessionStarted() {
  if (!state.sessionStartTime) {
    state.sessionStartTime = Date.now();
    persist();
  }
}

export function getSessionElapsed() {
  if (!state.sessionStartTime) return 0;
  return Math.floor((Date.now() - state.sessionStartTime) / 1000);
}

export function isSessionActive() {
  return state.sessionStartTime != null;
}

export function closeSession(endTime) {
  const closedStart = state.sessionStartTime;
  const closedAt = Date.now();
  let duration = 0;
  const end = endTime || Date.now();
  if (state.sessionStartTime) {
    duration = Math.floor((end - state.sessionStartTime) / 1000);
  }
  state.sessionStartTime = null;
  state.rodTimers = {};
  state.rods = [{ id: 1, config: {} }];
  state.mixedGroundbaits = [];
  state.lastCatchTime = null;
  state.lastCatchLocation = null;
  state.competition = defaultCompetition();
  if (closedStart != null) {
    // v3.181 — remembered here at once; the other devices are told after the upload
    rememberClosed(closedStart, closedAt);
    try {
      localStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify({ start: closedStart, closedAt }));
    } catch {
      // ignore
    }
  }
  persist();
  if (closedStart != null) finalizePendingClose(false);
  return duration;
}

// --- Auto-close after 10 hours without a catch ---
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

export function recordCatchTime() {
  state.lastCatchTime = Date.now();
  persist();
}

export function getLastCatchTime() {
  return state.lastCatchTime;
}

// The last precise GPS fix confirmed for a catch this session — lets
// handleSaveCatch (ActiveSession.jsx) skip an expensive precise re-fix for
// the next catch when a cheap coarse check shows the angler hasn't moved,
// reusing this instead. Reset to null when the session closes, so the very
// next session's first catch always gets a fresh precise fix (there's
// nothing yet to compare against).
export function getLastCatchLocation() {
  return state.lastCatchLocation;
}

export function recordCatchLocation(name, lat, lng) {
  state.lastCatchLocation = { name, lat, lng };
  persist();
}

export function checkAutoClose() {
  if (!state.sessionStartTime) return { shouldClose: false, endTime: null };
  // v3.147 — a stored session may be stale and about to be replaced by the live
  // one from the cloud: never auto-close before that comparison has run.
  if (!reconcileSettled) return { shouldClose: false, endTime: null };
  const referenceTime = state.lastCatchTime || state.sessionStartTime;
  if (Date.now() - referenceTime >= TEN_HOURS_MS) {
    return { shouldClose: true, endTime: referenceTime };
  }
  return { shouldClose: false, endTime: null };
}

// --- Mixed groundbaits ---

export function getMixedGroundbaits() {
  return state.mixedGroundbaits || [];
}

export function addMixedGroundbait(entry) {
  if (!state.mixedGroundbaits) state.mixedGroundbaits = [];
  state.mixedGroundbaits.push(entry);
  persist();
}

export function removeMixedGroundbait(index) {
  if (!state.mixedGroundbaits) return;
  state.mixedGroundbaits.splice(index, 1);
  persist();
}

// --- Rods ---

export function getRods() {
  return state.rods;
}

export function setRods(rods) {
  state.rods = rods;
  persist();
}

export function updateRodConfig(rodId, config) {
  state.rods = state.rods.map((r) => (r.id === rodId ? { ...r, config } : r));
  persist();
}

// v3.158 — a new rod takes the LOWEST free number (rods 1 and 3 open → the
// next one is 2), not max+1, so closing a rod frees its number for reuse.
function lowestFreeRodId(rods) {
  const used = new Set(rods.map((r) => r.id));
  let id = 1;
  while (used.has(id)) id++;
  return id;
}

function insertRod(rods) {
  return [...rods, { id: lowestFreeRodId(rods), config: {} }].sort((a, b) => a.id - b.id);
}

export function addRod() {
  state.rods = insertRod(state.rods);
  persist();
}

export function removeRod(rodId) {
  if (state.rods.length <= 1) return;
  delete state.rodTimers[rodId];
  state.rods = state.rods.filter((r) => r.id !== rodId);
  persist();
}

export function setRodName(rodId, name) {
  state.rods = state.rods.map((r) => (r.id === rodId ? { ...r, name: name || "" } : r));
  persist();
}

// --- Competition mode (v3.158) ---
// Kept in the session state, so it is mirrored across devices together with
// the running session (the cloud row only exists once the session started).

export function getCompetition() {
  return state.competition || defaultCompetition();
}

export function setCompetitionEnabled(on) {
  if (on) {
    state.competition = {
      ...defaultCompetition(),
      enabled: true,
      activeRodId: state.rods[0] ? state.rods[0].id : 1,
    };
  } else {
    state.competition = defaultCompetition();
  }
  persist();
}

export function setCompetitionTime(key, hm) {
  const cur = getCompetition();
  const next = { ...cur, hm: { ...cur.hm, [key]: hm || "" } };
  const anySet = Object.values(next.hm).some(Boolean);
  if (!anySet) next.baseDay = null;
  else if (!next.baseDay) next.baseDay = pickBaseDay(hm);
  state.competition = next;
  persist();
}

export function setCompetitionActiveRod(rodId) {
  state.competition = { ...getCompetition(), activeRodId: rodId };
  persist();
}

// Brings the number of rods to n (1..MAX_COMPETITION_RODS): new rods are added
// at the end, surplus ones are removed from the end.
export function setCompetitionRodCount(n) {
  const count = Math.max(1, Math.min(MAX_COMPETITION_RODS, Number(n) || 1));
  let rods = state.rods;
  while (rods.length < count) {
    rods = insertRod(rods);
  }
  while (rods.length > count) {
    const removed = rods[rods.length - 1];
    if (state.rodTimers[removed.id] && state.rodTimers[removed.id].isRunning) break; // never drop a rod with a fish on
    delete state.rodTimers[removed.id];
    rods = rods.slice(0, -1);
  }
  state.rods = rods;
  const cur = getCompetition();
  if (!rods.some((r) => r.id === cur.activeRodId)) {
    state.competition = { ...cur, activeRodId: rods[0].id };
  }
  persist();
}

// --- Rod timers ---

function getOrCreateTimer(rodId) {
  if (!state.rodTimers[rodId]) {
    state.rodTimers[rodId] = {
      startTime: null,
      accumulated: 0,
      isRunning: false,
      reminderMinutes: null,
      beepDuration: 0.5,
      reminderStartTime: null,
      reminderTriggered: false,
    };
  }
  return state.rodTimers[rodId];
}

export function getRodTimerState(rodId) {
  const timer = state.rodTimers[rodId] || getOrCreateTimer(rodId);
  let elapsed = timer.accumulated;
  let reminderRemaining = 0;
  let reminderTriggered = false;

  if (timer.isRunning && timer.startTime) {
    const now = Date.now();
    elapsed += Math.floor((now - timer.startTime) / 1000);

    if (timer.reminderMinutes) {
      const reminderElapsed = Math.floor((now - timer.startTime) / 1000);
      reminderRemaining = Math.max(0, timer.reminderMinutes * 60 - reminderElapsed);
      reminderTriggered = reminderRemaining === 0;
    }
  }

  return {
    elapsed,
    isRunning: timer.isRunning,
    reminderMinutes: timer.reminderMinutes,
    beepDuration: timer.beepDuration ?? 0.5,
    reminderRemaining,
    reminderTriggered,
    reminderBeepsPlayed: timer.reminderTriggered || false,
  };
}

export function markReminderTriggered(rodId) {
  const timer = getOrCreateTimer(rodId);
  if (timer.reminderTriggered) return false;
  timer.reminderTriggered = true;
  persist(false);
  return true;
}

export function getRunningTimers() {
  return Object.keys(state.rodTimers)
    .map((rodId) => {
      const rodIdNum = parseInt(rodId);
      const timerState = state.rodTimers[rodId];
      if (!timerState.isRunning || !timerState.startTime) return null;
      const ts = getRodTimerState(rodIdNum);
      return ts ? { rodId: rodIdNum, ...ts } : null;
    })
    .filter(Boolean);
}

export function startRodTimer(rodId, reminderMinutes) {
  ensureSessionStarted();
  const timer = getOrCreateTimer(rodId);
  timer.isRunning = true;
  timer.startTime = Date.now();
  timer.reminderTriggered = false;
  if (reminderMinutes != null && reminderMinutes > 0) {
    timer.reminderMinutes = reminderMinutes;
  } else if (reminderMinutes === 0) {
    timer.reminderMinutes = null;
  }
  persist();
}

export function landRodFish(rodId) {
  // Stop timer, return elapsed, reset accumulated
  const timer = getOrCreateTimer(rodId);
  let elapsed = timer.accumulated;
  if (timer.isRunning && timer.startTime) {
    elapsed += Math.floor((Date.now() - timer.startTime) / 1000);
  }
  timer.isRunning = false;
  timer.startTime = null;
  timer.accumulated = 0;
  timer.reminderTriggered = false;
  timer.reminderStartTime = null;
  persist();
  return elapsed;
}

export function cancelRodTimer(rodId) {
  const timer = getOrCreateTimer(rodId);
  timer.isRunning = false;
  timer.startTime = null;
  timer.accumulated = 0;
  timer.reminderTriggered = false;
  timer.reminderStartTime = null;
  persist();
}

export function setRodReminder(rodId, minutes) {
  const timer = getOrCreateTimer(rodId);
  if (!minutes || minutes <= 0) {
    timer.reminderMinutes = null;
    timer.reminderTriggered = false;
  } else {
    timer.reminderMinutes = minutes;
    timer.reminderTriggered = false;
  }
  persist();
}

export function setRodBeepDuration(rodId, duration) {
  const timer = getOrCreateTimer(rodId);
  timer.beepDuration = duration;
  persist();
}