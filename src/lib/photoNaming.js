// Builds human-recognizable filenames for photos inside an exported .zip —
// used by both the personal export (src/lib/dataPortability.js) and the
// admin global backup (src/lib/globalBackup.js) so a downloaded archive's
// photos can be told apart at a glance instead of just "<uuid>.jpg".

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extracts the catch_photos id from a /api/catch-photos/:id URL, if any. */
export function extractPhotoId(url) {
  if (!url) return null;
  const m = String(url).match(UUID_RE);
  return m ? m[0] : null;
}

function slugify(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "") // filesystem-unsafe characters
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateParts(date) {
  if (!date || Number.isNaN(date.getTime())) return { date: "неизвестна-дата", time: "00-00-00" };
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  };
}

/** A short, filename-safe label for a user: their name, or the part of their email before @. */
export function userLabel(user) {
  const name = user?.full_name?.trim();
  if (name) return slugify(name);
  const email = user?.email || "";
  return slugify(email.split("@")[0]) || "потребител";
}

/** Filename for a photo linked to a catch — user, session number, and the catch's own date/time. */
export function catchPhotoFilename({ user, catchDate, sessionNumber, photoId, ext }) {
  const { date, time } = dateParts(catchDate);
  const session = sessionNumber ? `_сесия${sessionNumber}` : "";
  const suffix = photoId ? `_${String(photoId).slice(0, 8)}` : "";
  return `${userLabel(user)}_${date}_${time}${session}${suffix}.${ext}`;
}

/** Filename for a photo used as an ad/water body logo (not linked to any catch). */
export function logoPhotoFilename({ label, uploadedAt, photoId, ext }) {
  const { date, time } = dateParts(uploadedAt);
  const suffix = photoId ? `_${String(photoId).slice(0, 8)}` : "";
  return `реклама_${slugify(label) || "лого"}_${date}_${time}${suffix}.${ext}`;
}

/** Fallback for a photo matching neither a catch nor a known logo field. */
export function unlinkedPhotoFilename({ photoId, uploadedAt, ext }) {
  const { date, time } = dateParts(uploadedAt);
  return `несвързана-снимка_${date}_${time}_${String(photoId).slice(0, 8)}.${ext}`;
}
