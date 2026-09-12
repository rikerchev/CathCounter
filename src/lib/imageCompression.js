// Client-side photo compression: every catch photo is resized/re-encoded in
// the browser (canvas) BEFORE it ever leaves the device, so what actually
// gets stored (in Postgres, see server/routes/catchPhotos.ts) lands in the
// ~100-150KB range. That keeps a free Supabase database able to hold a large
// number of catches, and keeps every photo small enough to write to and read
// back from IndexedDB quickly on the local-first save path (see
// src/lib/pendingPhotos.js) — nothing about compression itself needs network
// access, it all happens on-device before the file ever touches a queue.

const TARGET_MAX_BYTES = 150 * 1024; // upper end of the 100-150KB target
const TARGET_MIN_BYTES = 100 * 1024; // don't over-compress past this if avoidable
const MAX_DIMENSION = 1600; // long edge, in pixels — still plenty for a catch photo
const MIN_DIMENSION = 400; // never shrink smaller than this while chasing size

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawToCanvas(img, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Compresses an image File/Blob to roughly `targetMaxBytes`, returning a new
 * File (always re-encoded as JPEG — smaller than PNG/HEIC for photos and
 * universally supported). Falls back to the original file if anything about
 * the image can't be decoded in this browser (e.g. an unusual HEIC variant).
 */
export async function compressImage(file, opts = {}) {
  const targetMaxBytes = opts.targetMaxBytes ?? TARGET_MAX_BYTES;
  const targetMinBytes = opts.targetMinBytes ?? TARGET_MIN_BYTES;
  const maxDimension = opts.maxDimension ?? MAX_DIMENSION;

  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  // Already small enough (e.g. a second pass over an already-compressed
  // photo) — don't re-encode for no reason.
  if (file.size <= targetMaxBytes && file.type === "image/jpeg") return file;

  let img, url;
  try {
    ({ img, url } = await loadImage(file));
  } catch {
    return file; // couldn't decode — upload the original rather than fail
  }

  try {
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, maxDimension / longEdge);
    let width = Math.max(1, Math.round(img.naturalWidth * scale));
    let height = Math.max(1, Math.round(img.naturalHeight * scale));

    let canvas = drawToCanvas(img, width, height);
    let quality = 0.8;
    let blob = await canvasToBlob(canvas, quality);
    if (!blob) return file;

    // Step 1: reduce JPEG quality first (cheapest way to cut size without
    // losing resolution). A ~100-150KB target needs quality pushed lower and
    // more iterations than the previous ~400-500KB target did to reliably
    // converge.
    let guard = 0;
    while (blob.size > targetMaxBytes && quality > 0.22 && guard < 10) {
      quality = Math.round((quality - 0.08) * 100) / 100;
      blob = await canvasToBlob(canvas, quality);
      guard++;
    }

    // Step 2: if quality alone can't get there, shrink dimensions too and
    // retry at a slightly higher quality each time.
    guard = 0;
    while (blob.size > targetMaxBytes && Math.max(width, height) > MIN_DIMENSION && guard < 8) {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
      canvas = drawToCanvas(img, width, height);
      quality = Math.min(0.6, quality + 0.05);
      blob = await canvasToBlob(canvas, quality);
      guard++;
    }

    // Optional: if we ended up much smaller than the target range, nudge
    // quality back up once — nice-to-have, never worth failing over.
    if (blob.size < targetMinBytes && quality < 0.8) {
      const better = await canvasToBlob(canvas, Math.min(0.8, quality + 0.15));
      if (better && better.size <= targetMaxBytes) blob = better;
    }

    const name = (file.name || "photo").replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}
