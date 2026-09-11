import postgres from "postgres";
import { env } from "./env.ts";

// A single shared connection pool. `postgres` (porsager/postgres) manages
// pooling internally and is happy running under any Deno host, serverless
// or long-lived — no platform-specific pooling config needed here.
export const sql = postgres(env.DATABASE_URL, {
  // Most managed Postgres providers (Neon, Supabase, RDS) require TLS.
  // Self-hosted Postgres without TLS will still work; "prefer" tries TLS
  // and falls back automatically.
  ssl: "prefer",
});
