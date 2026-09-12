import postgres from "postgres";
import { env } from "./env.js";

// A single shared connection. `postgres` (porsager/postgres) manages
// pooling internally and works the same whether this module is loaded once
// in a long-running process (server/main.ts) or fresh on each Vercel
// Function invocation (api/[...path].ts).
//
// `max: 1` + `prepare: false` are the standard-recommended settings for
// serverless: each function instance keeps at most one connection, and
// prepared statements are disabled because Supabase's connection pooler
// (PgBouncer, transaction mode — use its pooled connection string, usually
// port 6543, as DATABASE_URL when deploying to Vercel) doesn't support them.
// Both are harmless for a normal long-running server too.
export const sql = postgres(env.DATABASE_URL, {
  ssl: "prefer",
  max: 1,
  prepare: false,
  // Vercel can freeze a function's container between requests and thaw it
  // later with a TCP socket that looks fine locally but was silently
  // dropped on the wire during the freeze (a NAT/load balancer timeout) —
  // `postgres` then tries to reuse that dead connection and a query can
  // hang forever with no error, which is exactly what was blocking
  // registration (and anything else touching the DB) intermittently.
  // Closing idle connections quickly and capping connect time means a
  // stale connection gets replaced with a fresh one instead of hanging.
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 5,
});
