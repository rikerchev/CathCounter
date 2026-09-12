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
    // `sql` is called two very different ways in this codebase:
    //  1. `` sql`SELECT ...` `` — a real tagged-template query. JS itself
    //     guarantees `args[0]` is the frozen strings array with a `.raw`
    //     property in this case, and only this case.
    //  2. `sql(set, ...keys)` — postgres.js's *helper* form (used in
    //     auth.ts to build a dynamic `SET col = val, ...` fragment for
    //     embedding inside an outer tagged-template query). This does NOT
    //     return a real query — it returns a Helper/Identifier object whose
    //     `.then` is a misuse guard that THROWS "NOT_TAGGED_CALL" the
    //     moment anything calls `.then`/awaits it directly (Promise.race,
    //     Promise.resolve(...).catch(...), etc. all do exactly that).
    // Wrapping case 2 the same way as case 1 crashed the whole process
    // with an unhandled rejection (discovered in production via Vercel
    // logs) — so only real tagged-template calls get the timeout/
    // reconnect treatment; helper calls pass straight through untouched.
    const isTaggedTemplateCall = Array.isArray(args[0]) && Array.isArray((args[0] as { raw?: unknown }).raw);
    if (!isTaggedTemplateCall) {
      return Reflect.apply(client, client, args);
    }

    const current = client;
    const queryPromise = Reflect.apply(current, current, args);
    // The original query may still settle later even though we've stopped
    // waiting on it below — swallow that so Node doesn't complain about an
    // unhandled rejection.
    Promise.resolve(queryPromise).catch(() => {});

    return Promise.race([
      queryPromise,
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (client === current) {
            // Deliberately NOT calling `client.end()` here. Several queries
            // can be in flight at once on this one `max: 1` connection
            // (e.g. sendEmail's Promise.all of getConfig() calls) — forcing
            // the connection closed cascades a CONNECTION_DESTROYED
            // rejection into every one of those *other* in-flight queries,
            // and some of those rejections turned out to be unreachable by
            // any of our own .catch()es, crashing the whole function
            // (confirmed in production logs — this used to call
            // client.end({ timeout: 0 }) and that is what caused it).
            // Just stop using this connection for anything new; the old
            // one is abandoned and cleans itself up via idle_timeout /
            // max_lifetime instead of being torn down synchronously.
            client = createClient();
          }
          // Retry the same query once on the replacement connection instead
          // of just failing — a stale connection is exactly the case this
          // whole mechanism exists to recover from, so the caller should
          // only ever see an error if the retry ALSO fails (e.g. the DB is
          // genuinely unreachable), not on every ordinary stale-connection
          // hiccup. A brand-new connection is bounded by `connect_timeout`
          // (10s) on its own, so this can't hang forever either.
          Reflect.apply(client, client, args).then(resolve, reject);
        }, QUERY_TIMEOUT_MS);
      }),
    ]);
  },
  get(_target, prop) {
    const value = Reflect.get(client, prop as keyof typeof client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as unknown as typeof client;
