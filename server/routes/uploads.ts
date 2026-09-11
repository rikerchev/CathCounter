import { uploadObject } from "../lib/s3.ts";
import { getConfig } from "../lib/settings.ts";
import type { AuthUser } from "../middleware/auth.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
  };
  return map[ct] || "bin";
}

/**
 * POST /api/uploads?public=true|false
 * Body: raw file bytes, Content-Type set to the file's mime type.
 * Mirrors base44 integrations.Core.UploadFile / UploadPublicFile, both of
 * which just return `{ file_url }`.
 */
export async function handleUploadsRoute(
  req: Request,
  user: AuthUser | null,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  if (!user) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  const isPublic = url.searchParams.get("public") === "true";
  const contentType = req.headers.get("content-type") || "application/octet-stream";
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength === 0) return json({ error: "Empty file" }, 400);
  if (body.byteLength > 25 * 1024 * 1024) return json({ error: "File too large (25MB max)" }, 413);

  const key = `${user.id}/${crypto.randomUUID()}.${extFromContentType(contentType)}`;
  try {
    const publicBucket = isPublic ? await getConfig("S3_PUBLIC_BUCKET") : "";
    const { url: fileUrl } = await uploadObject({
      key,
      body,
      contentType,
      bucket: publicBucket || undefined,
    });
    return json({ file_url: fileUrl });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}
