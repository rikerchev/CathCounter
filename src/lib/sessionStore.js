// Global session store: persists timer state across navigation.
// Uses timestamps so timers keep running even when the component unmounts.
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "catchcount_session";
const DEVICE_ID_KEY = "catchcount_device_id";

let state = loadState();
const listeners = new Set();

// --- Cloud sync (cross-device session resume) ---
//
// v3.144 — rewritten after two devices on one account showed wrong timer
// hours and lost the second rod. Root causes:
//  1. For an admin account the server's list() returns EVERY user's
//     SessionSync rows; the old code took "the first active row" of the 10
//     newest, i.e. possibly ANOTHER user's session (foreign timers, a single
//     rod) — and then even wrote back into that row.
//  2. list("-updated_date") never sorted by update time (the column is
//     updated_at), and rows have no updated_date, so the "only merge if newer"
//     check never fired: every poll replaced the local state wholesale, also
//     discarding local changes not pushed yet.
//  3. A device that had not seen the cloud row yet created a second row, and
//     an idle device pushed its empty default state over the live one.
// Now: only the caller's own rows are used (filtered by created_by_id), one
// row per account is reused, an idle device never writes, and a poll never
// overwrites local changes that are still waiting to be pushed.
let cloudSessionId = null;
let cloudSyncTimer = null;
let crossDevicePollTimer = null;
let lastCloudUpdateDate = null;
// A push failed (offline etc.) — retried from the next poll, and until it
// succeeds no remote state may overwrite ours.
let unpushed = false;

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

async function pushStateToCloud() {
  const body = {
    session_data: JSON.stringify(state),
    is_active: true,
    device_id: getDeviceId(),
  };
  if (cloudSessionId) {
    try {
      return await base44.entities.SessionSync.update(cloudSessionId, body);
    } catch (e) {
      if (e && e.status !== 404 && e.status !== 403) throw e;
      cloudSessionId = null; // row gone — look it up again below
    }
  }
  const rows = await fetchMyRows();
  if (rows === null) return null; // not signed in
  const existing = rows.find((r) => r.is_active) || rows[0];
  if (existing) {
    cloudSessionId = existing.id;
    return base44.entities.SessionSync.update(existing.id, body);
  }
  const created = await base44.entities.SessionSync.create(body);
  cloudSessionId = created.id;
  return created;
}

function syncToCloud() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    // An idle device (no running session) has nothing to mirror; writing its
    // empty default state would wipe the live session of the other device.
    // Closing a session is handled by closeCloudSession().
    if (state.sessionStartTime == null) {
      unpushed = false;
      return;
    }
    try {
      const saved = await pushStateToCloud();
      if (saved && rowStamp(saved)) lastCloudUpdateDate = rowStamp(saved);
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
    state = data;
    lastCloudUpdateDate = rowStamp(cloudSession) || lastCloudUpdateDate;
    persist();
    cloudSessionId = cloudSession.id;
    return true;
  } catch {
    return false;
  }
}

export async function closeCloudSession() {
  // The closed session must never be pushed again by a pending timer.
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }
  unpushed = false;
  try {
    const rows = await fetchMyRows();
    // Deactivate every one of this account's active rows (older duplicates
    // from before v3.144 included), so no stale row can come back as "the
    // active session" on another device.
    const ids = new Set((rows || []).filter((r) => r.is_active).map((r) => r.id));
    if (cloudSessionId) ids.add(cloudSessionId);
    await Promise.all(
      [...ids].map((id) =>
        base44.entities.SessionSync.update(id, { is_active: false, device_id: getDeviceId() }).catch(() => {})
      )
    );
  } catch {
    // Silently fail
  }
  // The poll keeps running while the page is open (it is stopped when
  // ActiveSession unmounts) so a session started on the other device shows up.
}

function isValidState(d) {
  return !!d && typeof d === "object" && Array.isArray(d.rods) && d.rods.length > 0
    && d.rodTimers && typeof d.rodTimers === "object" && d.sessionStartTime != null;
}

// --- Continuous cross-device sync ---
// Polls the account's own cloud session every CROSS_DEVICE_POLL_MS for changes
// from other devices. When a newer change from a different device is found,
// it is merged locally (and the timers/rods shown there are mirrored here).
//
// v3.47 — was 10s; 30s. v3.144 — 15s while the page is visible: the whole
// point of this poll is the two-device mirror, and 30s made a started timer
// show up on the other device far too late. Hidden/locked pages still skip
// the request entirely (see startCrossDeviceSync).
const CROSS_DEVICE_POLL_MS = 15000;
function mergeCloudState(cloudSession) {
  try {
    // Never replace local changes that are still waiting to be pushed.
    if (cloudSyncTimer || unpushed) return false;
    // Only accept if from a different device
    if (cloudSession.device_id === getDeviceId()) return false;
    // Only accept if newer than what we last saw
    const stamp = rowStamp(cloudSession);
    if (lastCloudUpdateDate && stamp <= lastCloudUpdateDate) return false;
    const data = JSON.parse(cloudSession.session_data);
    if (!isValidState(data)) return false;

    lastCloudUpdateDate = stamp;
    state = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}

async function pollCrossDeviceOnce() {
  try {
    // A failed push is retried here first; merging waits until it succeeded.
    if (unpushed && !cloudSyncTimer) syncToCloud();
    if (cloudSyncTimer || unpushed) return;
    const rows = await fetchMyRows();
    if (!rows) return;
    const active = rows.find((s) => s.is_active);
    if (!active) return;
    // Keep track of cloud session ID
    cloudSessionId = active.id;
    mergeCloudState(active);
  } catch {
    // Silently fail — cross-device sync is best-effort
  }
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

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return {
    sessionStartTime: null,
    rods: [{ id: 1, config: {} }],
    rodTimers: {}, // { [rodId]: { startTime, accumulated, isRunning, reminderMinutes, reminderStartTime, reminderTriggered } }
    mixedGroundbaits: [], // [{ name, grams }]
    lastCatchTime: null,
    lastCatchLocation: null, // { name, lat, lng } — the last precise GPS fix
    // confirmed for a catch this session (see recordCatchLocation below).
  };
}

function persist() {
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
  persist();
  closeCloudSession();
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

export function addRod() {
  const maxId = state.rods.reduce((max, r) => Math.max(max, r.id), 0);
  state.rods = [...state.rods, { id: maxId + 1, config: {} }];
  persist();
}

export function removeRod(rodId) {
  if (state.rods.length <= 1) return;
  delete state.rodTimers[rodId];
  state.rods = state.rods.filter((r) => r.id !== rodId);
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
  persist();
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