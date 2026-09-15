import postgres from "postgres";
import { env } from "./env.js";

// `prepare: false` only matters (and is only safe) if DATABASE_URL is
// Supabase's *pooled* connection string (PgBouncer, transaction mode,
// normally port 6543) — prepared statements don't survive being multiplexed
// across backend connections in that mode, so this was set for that setup.
//
// v2.75 — `max` raised 1 -> 3. With `max: 1`, every request past the first
// one already in flight on this same warm serverless instance had to queue
// behind it for a spot; a page that fires several background fetches at
// once (its own data + NotificationsBell + the ad banner + the sync
// engine's Catch/Bait pull) routinely pushed 2nd/3rd-in-line requests past
// the client's 12s timeout even though the server was fine and would have
// answered given a few more seconds — seen repeatedly as "Request timed
// out" toasts, worst when switching between pages quickly. PgBouncer in
// transaction mode is built to have many logical `postgres` clients like
// this one share a much smaller pool of real Postgres backend connections,
// so a few concurrent connections *from this one function instance* is the
// normal, intended way to use it — it only becomes a problem if DATABASE_URL
// is actually the *direct* (non-pooled, port 5432) connection string, which
// has a much lower real connection ceiling. Check Vercel → Settings →
// Environment Variables → DATABASE_URL: if its port is 6543 this is safe as
// is; if it's 5432, switch to the pooled string from Supabase → Project
// Settings → Database first (or drop `max` back to 1 in the meantime).
function createClient() {
  return postgres(env.DATABASE_URL, {
    ssl: "prefer",
    max: 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 5,
  });
}

// A previous version of this file wrapped `sql` in a Proxy to add a
// per-query timeout + auto-reconnect directly here. That interception
// turned out to be unsafe: postgres.js's tagged-template calls and its
// `sql(obj, ...keys)` "helper" form (used to build dynamic `SET col = val`
// fragments — see auth.ts, entities.ts, userEntity.ts) both rely on being
// invoked exactly the way real code invokes them, and re-dispatching those
// calls through Reflect.apply/Promise.race corrupted query construction in
// production (confirmed via Vercel logs: "syntax error at or near $1" on
// UPDATE queries using the helper form, and a separate crash from forcing
// the connection closed mid-query). Both bugs traced back to this file.
//
// `sql` is now used completely unmodified — a plain postgres.js client, so
// every calling convention postgres.js expects works exactly as documented.
// The stale-connection problem this used to guard against (Vercel freezing
// a container between requests and thawing it with a dead socket, which
// can make a query hang with no error) is instead handled one level up, at
// the whole-request level in server/router.ts: if handling a request takes
// too long, that request gets a clean error response AND `reconnect()`
// below is called to replace this connection before the next request —
// without ever touching how an individual query is invoked.
export let sql = createClient();

export function reconnect(): void {
  sql = createClient();
}
