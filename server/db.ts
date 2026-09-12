import postgres from "postgres";
import { env } from "./env.js";

// `max: 1` + `prepare: false` are the standard-recommended settings for
// serverless: each function instance keeps at most one connection, and
// prepared statements are disabled because Supabase's connection pooler
// (PgBouncer, transaction mode — use its pooled connection string, usually
// port 6543, as DATABASE_URL when deploying to Vercel) doesn't support them.
function createClient() {
  return postgres(env.DATABASE_URL, {
    ssl: "prefer",
    max: 1,
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
