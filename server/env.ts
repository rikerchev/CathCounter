// Central place that reads every env var the server needs.
// Plain Node.js (no Deno) — works on any Node host: Render, Railway, Fly.io,
// a VPS, systemd, PM2, whatever. Loads server/.env via dotenv (see main.ts).

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // --- core ---
  PORT: Number(optional("PORT", "8787")),
  PUBLIC_APP_URL: optional("PUBLIC_APP_URL", "http://localhost:5173"),
  // Public URL of THIS API server. Set this explicitly on most hosts (Render,
  // Railway, ...) — they terminate TLS at a proxy in front of the container,
  // so the request the app actually sees looks like plain HTTP and the
  // catch-photos URL-building code can't reliably auto-detect "https"
  // otherwise. Leave empty only for local dev.
  PUBLIC_API_URL: optional("PUBLIC_API_URL"),
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

  // --- email (SMTP — any provider: your own mail server, a free-tier
  // transactional sender like Brevo/SMTP2GO, or even Gmail SMTP for testing) ---
  SMTP_HOST: optional("SMTP_HOST"),
  SMTP_PORT: optional("SMTP_PORT", "587"),
  SMTP_SECURE: optional("SMTP_SECURE", "false"), // "true" for port 465 (implicit TLS)
  SMTP_USER: optional("SMTP_USER"),
  SMTP_PASSWORD: optional("SMTP_PASSWORD"),
  EMAIL_FROM: optional("EMAIL_FROM", "CatchCount <noreply@catchcount.app>"),

  // --- llm (stubbed unless a key is supplied) ---
  LLM_PROVIDER: optional("LLM_PROVIDER", "none"), // "anthropic" | "openai" | "none"
  LLM_API_KEY: optional("LLM_API_KEY"),

  // --- keep-alive cron (server/router.ts /api/cron/keep-alive) ---
  // Not required. If set, Vercel Cron automatically sends it back as
  // "Authorization: Bearer <value>" on the scheduled request, and the
  // endpoint checks it. Left empty, the endpoint just accepts any request —
  // acceptable since all it does is run a trivial read-only query.
  CRON_SECRET: optional("CRON_SECRET"),
};
