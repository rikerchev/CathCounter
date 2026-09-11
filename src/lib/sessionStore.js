// Global session store: persists timer state across navigation.
// Uses timestamps so timers keep running even when the component unmounts.
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "catchcount_session";
const DEVICE_ID_KEY = "catchcount_device_id";

let state = loadState();
const listeners = new Set();

// --- Cloud sync (cross-device session resume) ---
let cloudSessionId = null;
let cloudSyncTimer = null;
let crossDevicePollTimer = null;
let lastCloudUpdateDate = null;

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

function syncToCloud() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    try {
      const authed = await base44.auth.isAuthenticated();
      if (!authed) return;
      const data = JSON.stringify(state);
      const isActive = state.sessionStartTime != null;
      if (cloudSessionId) {
        await base44.entities.SessionSync.update(cloudSessionId, {
          session_data: data,
          is_active: isActive,
          device_id: getDeviceId(),
        });
      } else {
        const created = await base44.entities.SessionSync.create({
          session_data: data,
          is_active: isActive,
          device_id: getDeviceId(),
        });
        cloudSessionId = created.id;
      }
    } catch {
      // Silently fail — cloud sync is best-effort
    }
  }, 3000);
}

export async function checkCloudSession() {
  try {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) return null;
    const sessions = await base44.entities.SessionSync.list("-updated_date", 10);
    const active = (sessions || []).find(s => s.is_active);
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
    state = data;
    persist();
    cloudSessionId = cloudSession.id;
    syncToCloud();
    return true;
  } catch {
    return false;
  }
}

export async function closeCloudSession() {
  if (cloudSessionId) {
    try {
      await base44.entities.SessionSync.update(cloudSessionId, { is_active: false });
    } catch {
      // Silently fail
    }
  }
  stopCrossDeviceSync();
}

// --- Continuous cross-device sync ---
// Polls the cloud session every 10s for changes from other devices.
// When a change is detected (different device, newer updated_date), merges it locally.
function mergeCloudState(cloudSession) {
  try {
    const data = JSON.parse(cloudSession.session_data);
    // Only accept if from a different device
    if (cloudSession.device_id === getDeviceId()) return false;
    // Only accept if newer than what we last saw
    if (lastCloudUpdateDate && cloudSession.updated_date <= lastCloudUpdateDate) return false;

    lastCloudUpdateDate = cloudSession.updated_date;
    state = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}

export function startCrossDeviceSync() {
  if (crossDevicePollTimer) return;
  crossDevicePollTimer = setInterval(async () => {
    try {
      const authed = await base44.auth.isAuthenticated();
      if (!authed) return;
      // Find our cloud session or the active one
      const sessions = await base44.entities.SessionSync.list("-updated_date", 10);
      const active = (sessions || []).find(s => s.is_active);
      if (!active) return;
      // Keep track of cloud session ID
      cloudSessionId = active.id;
      mergeCloudState(active);
    } catch {
      // Silently fail — cross-device sync is best-effort
    }
  }, 10000);
}

export function stopCrossDeviceSync() {
  if (crossDevicePollTimer) {
    clearInterval(crossDevicePollTimer);
    crossDevicePollTimer = null;
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