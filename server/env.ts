// Central place that reads every env var the server needs.
// Nothing here is platform-specific (Deno Deploy, Docker, a VPS, systemd —
// all of them just set environment variables), so the server itself stays
// deployable anywhere `deno run` works.

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

export const env = {
  // --- core ---
  PORT: Number(optional("PORT", "8787")),
  PUBLIC_APP_URL: optional("PUBLIC_APP_URL", "http://localhost:5173"),
  JWT_SECRET: optional("JWT_SECRET", "dev-insecure-secret-change-me"),

  // --- database ---
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },

  // --- google oauth (social login) ---
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: optional(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8787/api/auth/google/callback",
  ),

  // --- object storage (generic S3-compatible: R2 / S3 / B2 / MinIO / ...) ---
  S3_ENDPOINT: optional("S3_ENDPOINT"), // leave empty for real AWS S3
  S3_REGION: optional("S3_REGION", "auto"),
  S3_BUCKET: optional("S3_BUCKET", "catchcount-uploads"),
  S3_PUBLIC_BUCKET: optional("S3_PUBLIC_BUCKET", ""), // optional second bucket for UploadPublicFile
  S3_ACCESS_KEY_ID: optional("S3_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: optional("S3_SECRET_ACCESS_KEY"),
  S3_FORCE_PATH_STYLE: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  S3_PUBLIC_BASE_URL: optional("S3_PUBLIC_BASE_URL"), // e.g. your R2/CDN public domain, used to build photo_url

  // --- email ---
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  EMAIL_FROM: optional("EMAIL_FROM", "CatchCount <noreply@catchcount.app>"),

  // --- llm (stubbed unless a key is supplied) ---
  LLM_PROVIDER: optional("LLM_PROVIDER", "none"), // "anthropic" | "openai" | "none"
  LLM_API_KEY: optional("LLM_API_KEY"),

  // --- stripe (carried over from the base44/functions) ---
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET"),
};
