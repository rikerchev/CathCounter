// Generates beep sounds using the Web Audio API.
// One beep per minute set on the reminder timer.

let audioContext = null;
let beepTimeouts = [];

function getAudioContext() {
  if (!audioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioContext = new AC();
  }
  // Resume if suspended (mobile browsers require user gesture)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function playSingleBeep(ctx, delayMs, durationSec) {
  const timeout = setTimeout(() => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    oscillator.start(now);
    oscillator.stop(now + durationSec);
  }, delayMs);
  beepTimeouts.push(timeout);
}

export async function playBeeps(count, durationSec = 0.6) {
  stopBeeps();
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
  const intervalSec = 0.4;
  for (let i = 0; i < count; i++) {
    const offsetMs = i * intervalSec * 1000;
    playSingleBeep(ctx, offsetMs, Math.min(durationSec, intervalSec * 0.8));
  }
}

export function stopBeeps() {
  beepTimeouts.forEach(clearTimeout);
  beepTimeouts = [];
}

/**
 * Schedules beeps at a future Date.now() timestamp using the Web Audio API's
 * audio clock. The audio rendering thread is NOT throttled by the OS when the
 * page is hidden, so beeps fire even with the screen locked — no continuous
 * silent audio needed.
 * Returns an array of oscillator nodes (for cancellation).
 */
export function scheduleBeeps(atDateNow, count, durationSec = 0.5) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const delaySec = Math.max(0, (Number(atDateNow) || Date.now()) - Date.now()) / 1000;
  const baseTime = ctx.currentTime + delaySec;
  if (!isFinite(baseTime)) return null;
  const gap = 0.3;
  const oscillators = [];

  for (let i = 0; i < count; i++) {
    const beepStart = i === 0 ? baseTime : baseTime + i * (durationSec + gap);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, beepStart);
    gain.gain.linearRampToValueAtTime(0.3, beepStart + 0.02);
    gain.gain.linearRampToValueAtTime(0, beepStart + durationSec);
    osc.start(beepStart);
    osc.stop(beepStart + durationSec + 0.05);
    oscillators.push(osc);
  }

  return oscillators;
}

export function cancelScheduledBeeps(oscillators) {
  if (!oscillators) return;
  for (const osc of oscillators) {
    try { osc.stop(); } catch { /* already stopped */ }
  }
}