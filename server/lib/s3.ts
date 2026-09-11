import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getConfig } from "./settings.ts";

// Deliberately provider-agnostic: any S3-compatible endpoint works by setting
// S3_ENDPOINT (Cloudflare R2, Backblaze B2, MinIO, ...) or leaving it unset
// to talk to real AWS S3. No code here is R2- or AWS-specific.
//
// Built fresh on every call (not a module-level singleton) because these
// values can change at runtime via the Setup Wizard without a restart.
async function buildClient() {
  const [endpoint, region, forcePathStyle, accessKeyId, secretAccessKey] = await Promise.all([
    getConfig("S3_ENDPOINT"),
    getConfig("S3_REGION"),
    getConfig("S3_FORCE_PATH_STYLE"),
    getConfig("S3_ACCESS_KEY_ID"),
    getConfig("S3_SECRET_ACCESS_KEY"),
  ]);
  const client = new S3Client({
    region: region || "auto",
    endpoint: endpoint || undefined,
    forcePathStyle: forcePathStyle !== "false",
    credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
  });
  return { client, accessKeyId, secretAccessKey };
}

/**
 * Uploads a file buffer directly from the server and returns a URL the
 * frontend can use as `photo_url`. Mirrors base44's
 * `integrations.Core.UploadFile` / `UploadPublicFile`.
 */
export async function uploadObject(opts: {
  key: string;
  body: Uint8Array;
  contentType: string;
  bucket?: string;
}): Promise<{ url: string; key: string }> {
  const { client, accessKeyId, secretAccessKey } = await buildClient();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Object storage is not configured yet. Set it up in Admin → Setup, or " +
        "set S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY in your environment.",
    );
  }

  const [defaultBucket, publicBaseUrl] = await Promise.all([
    getConfig("S3_BUCKET"),
    getConfig("S3_PUBLIC_BASE_URL"),
  ]);
  const bucket = opts.bucket || defaultBucket;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  const url = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, "")}/${opts.key}`
    : await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: opts.key }),
      { expiresIn: 60 * 60 * 24 * 7 }, // 7 days, for providers with no public bucket/CDN set up
    );

  return { url, key: opts.key };
}
