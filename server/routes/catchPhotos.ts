import { sql } from "../db";
import { env } from "../env";
import type { AuthUser } from "../middleware/auth";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// The client compresses every photo to roughly 400-500KB before it ever gets
// here (see src/lib/imageCompression.js) so a large number of catches still
// fit comfortably inside a free Supabase Postgres database. This cap is just
// a safety net against a client that skipped compression — not the target.
const MAX_BYTES = 2 * 1024 * 1024; // 2MB hard limit
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Stores catch photos directly in Postgres (BYTEA) instead of external
 * object storage — no S3/R2/B2 account needed, and everything lives inside
 * the same free Supabase database.
 *
 * POST /api/catch-photos        body = raw image bytes, Content-Type set
 *                                -> { file_url }  (absolute URL to GET below)
 * GET  /api/catch-photos/:id    -> the image bytes, with the original mime type
 */
export async function handleCatchPhotosRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  const [id] = path;

  if (req.method === "POST" && !id) {
    if (!user) return json({ error: "Not authenticated" }, 401);

    const contentType = req.headers.get("content-type") || "";
    if (!ALLOWED_TYPES.has(contentType)) {
      return json({ error: "Unsupported image type" }, 415);
    }
    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength === 0) return json({ error: "Empty file" }, 400);
    if (body.byteLength > MAX_BYTES) {
      return json({ error: "File too large (2MB max)" }, 413);
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO catch_photos (data, mime_type, size_bytes, created_by_id)
      VALUES (${body}, ${contentType}, ${body.byteLength}, ${user.id})
      RETURNING id
    `;
    const photoId = rows[0].id;
    const origin = env.PUBLIC_API_URL || new URL(req.url).origin;
    return json({ file_url: `${origin}/api/catch-photos/${photoId}` });
  }

  if (req.method === "GET" && id) {
    const rows = await sql<{ data: Uint8Array; mime_type: string }[]>`
      SELECT data, mime_type FROM catch_photos WHERE id = ${id}
    `;
    if (!rows.length) return new Response("Not found", { status: 404 });
    const row = rows[0];
    return new Response(row.data, {
      headers: {
        "content-type": row.mime_type,
        // Photo bytes never change once uploaded (catches are re-photographed
        // by uploading a new one, not by mutating this row), so cache hard.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  return json({ error: "Not found" }, 404);
}
