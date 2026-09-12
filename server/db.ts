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

let client = createClient();

// Vercel can freeze a function's container between requests and thaw it
// later with a TCP socket that looks alive locally but was silently
// dropped on the wire during the freeze (a NAT/load balancer timeout).
// `idle_timeout`/`connect_timeout`/`max_lifetime` above are all timer-based
// and never get a chance to run while the container itself is frozen, so
// none of them catch this — the very first query sent over a now-stale
// connection can then hang forever with no error at all. This is what was
// making registration (and, intermittently, login — anything touching the
// DB) hang indefinitely in production instead of failing.
//
// The fix: wrap every query with our own timeout. If a query takes too
// long, give up on it AND throw away the whole connection so a fresh one
// opens on the very next query — since we only ever hold `max: 1`
// connection, without this a single stuck query would wedge every future
// request behind it forever.
const QUERY_TIMEOUT_MS = 8000;

export const sql: typeof client = new Proxy(client, {
  apply(_target, _thisArg, args) {
    const current = client;
    const queryPromise = Reflect.apply(current, current, args);
    // The original query may still settle later even though we've stopped
    // waiting on it below — swallow that so Node doesn't complain about an
    // unhandled rejection.
    Promise.resolve(queryPromise).catch(() => {});

    return Promise.race([
      queryPromise,
      new Promise((_, reject) => {
        setTimeout(() => {
          if (client === current) {
            client.end({ timeout: 0 }).catch(() => {});
            client = createClient();
          }
          reject(new Error("Database query timed out"));
        }, QUERY_TIMEOUT_MS);
      }),
    ]);
  },
  get(_target, prop) {
    const value = Reflect.get(client, prop as keyof typeof client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as unknown as typeof client;
