import { env } from "./env.js";
import { sql, reconnect } from "./db.js";
import { absoluteUrl } from "./lib/url.js";
import { getUserFromRequest } from "./middleware/auth.js";
import { handleAuthRoute } from "./routes/auth.js";
import { handleEntitiesRoute } from "./routes/entities.js";
import { handleFunctionsRoute } from "./routes/functions.js";
import { handleCatchPhotosRoute } from "./routes/catchPhotos.js";
import { handleIntegrationsRoute } from "./routes/integrations.js";
import { handleAdminSettingsRoute } from "./routes/adminSettings.js";
import { handleAdminBackupRoute } from "./routes/adminBackup.js";
import { handleAdminMigrationsRoute } from "./routes/adminMigrations.js";
import { handleAdminMerchantsRoute } from "./routes/adminMerchants.js";
import { handleCompetitionRegistrationsRoute } from "./routes/competitionRegistrations.js";
import { handlePublicSettingsRoute } from "./routes/publicSettings.js";
import { handleReferralsRoute } from "./routes/referrals.js";
import { handleMerchantReferralsRoute } from "./routes/merchantReferrals.js";
import { handleContactRoute } from "./routes/contact.js";
import { handleAdRenewalsCron } from "./routes/adRenewals.js";
import { handleCommunityRoute } from "./routes/community.js";
import { handleAnalyticsRoute } from "./routes/analytics.js";

// The actual API logic, as a plain Web-standard (Request) -> Response
// handler. Deliberately has no opinion about HOW it's served — main.ts wraps
// it in a standalone node:http server (for a VPS/Render/Railway/etc.),
// and the repo-root api/[...path].ts wraps this SAME function for Vercel
// Functions, so the two hosting styles share 100% of the route code.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": env.PUBLIC_APP_URL,
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

async function route(req: Request): Promise<Response> {
  const url = absoluteUrl(req);
  const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  // e.g. ["api", "entities", "Catch", "abc-123"]

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  if (segments[0] !== "api") {
    return new Response("Not found", { status: 404 });
  }

  const user = await getUserFromRequest(req);

  try {
    if (segments[1] === "auth") {
      return await handleAuthRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "entities") {
      return await handleEntitiesRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "functions") {
      return await handleFunctionsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "catch-photos") {
      return await handleCatchPhotosRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "integrations") {
      return await handleIntegrationsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "admin" && segments[2] === "settings") {
      return await handleAdminSettingsRoute(req, segments.slice(3), user);
    }
    if (segments[1] === "admin" && segments[2] === "backup") {
      return await handleAdminBackupRoute(req, segments.slice(3), user);
    }
    if (segments[1] === "admin" && segments[2] === "migrations") {
      return await handleAdminMigrationsRoute(req, segments.slice(3), user);
    }
    if (segments[1] === "admin" && segments[2] === "merchants") {
      return await handleAdminMerchantsRoute(req, segments.slice(3), user);
    }
    if (segments[1] === "competition-registrations") {
      return await handleCompetitionRegistrationsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "referrals") {
      return await handleReferralsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "merchant-referrals") {
      return await handleMerchantReferralsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "settings") {
      return await handlePublicSettingsRoute(req, segments.slice(2));
    }
    if (segments[1] === "contact") {
      return await handleContactRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "analytics") {
      return await handleAnalyticsRoute(req, segments.slice(2), user);
    }
    if (segments[1] === "community") {
      return await handleCommunityRoute(req, segments.slice(2), user);
    }
    // v3.168 — "/api/health" stays a plain liveness check (no DB). With
    // "?db=1" it also runs a trivial query: an external pinger (UptimeRobot /
    // cron-job.org, every ~5 min) uses that to keep the serverless instance
    // AND its database connection warm, so real users never pay the
    // cold-start / stale-socket cost themselves. Public and harmless —
    // returns nothing but ok/db status.
    if (segments[1] === "health") {
      let db: boolean | undefined;
      if (new URL(req.url, "http://x").searchParams.get("db") === "1") {
        try {
          await sql`SELECT 1`;
          db = true;
        } catch (e) {
          console.warn("[health] db ping failed:", e);
          return new Response(JSON.stringify({ ok: false, db: false }), {
            status: 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
      }
      return new Response(JSON.stringify(db === undefined ? { ok: true } : { ok: true, db }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    // Hit once a day by a Vercel Cron job (see vercel.json). Actually
    // touches the database (not just a static "ok") so it counts as real
    // activity toward Supabase's free-tier "pause after 7 days with no
    // database activity" rule — see docs on that pausing behavior:
    // https://supabase.com/docs/guides/platform/free-project-pausing
    // This is unrelated to (and does not replace) the request-level
    // timeout/reconnect below, which is what actually fixed the
    // registration/login hangs — this cron only prevents the separate,
    // much rarer case of the whole project going fully inactive.
    if (segments[1] === "cron" && segments[2] === "keep-alive") {
      if (env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      await sql`SELECT 1`;
      return new Response(JSON.stringify({ ok: true, pinged: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    // Hit once a day by a second Vercel Cron job (see vercel.json) — sends
    // the ad renewal/expiry email notices. See server/routes/adRenewals.ts.
    if (segments[1] === "cron" && segments[2] === "ad-renewals") {
      return await handleAdRenewalsCron(req);
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

// Vercel can freeze a function's container between requests and thaw it
// later with a TCP socket that looks alive locally but was silently
// dropped on the wire during the freeze (a NAT/load balancer timeout) — the
// very first query sent over a now-stale connection can then hang forever
// with no error at all, which is what made registration/login hang
// indefinitely before this existed.
//
// Rather than intercepting individual `sql` calls (tried before — it broke
// postgres.js's own dynamic-query helpers in production, see db.ts), the
// whole request is raced against a timeout here. If it fires: the caller
// gets a clean error instead of hanging, and the DB connection is thrown
// away so the *next* request gets a fresh one instead of reusing the
// (probably dead) one — `sql` is a live-reassignable export (`export let`),
// so every file importing it automatically picks up the replacement.
//
// v3.167 — two changes after Admin → Управление на потребители hung for ~25 s and
// then failed until the page was refreshed:
//  1. READS (GET and POST .../filter) now give up after 9 s, not 20 s. The app's
//     own fetch gives up after 12 s and retries; with a 20 s server timeout that
//     retry landed on the SAME instance whose database connections were still
//     stale (reconnect() only ran at 20 s), hung again, and the page failed.
//     With 9 s the connections are replaced BEFORE the client's retry arrives,
//     and the 504 is itself retried by the client (see apiFetch's RETRY rules).
//     Writes, functions, backups, migrations keep 20 s.
//  2. When this instance has been idle for 20 s+ (Vercel may have frozen it and
//     the sockets are probably dead — postgres.js would have closed idle ones
//     after 20 s anyway), the connections are replaced up-front instead of
//     letting the first query of the next request hang until the timeout.
const REQUEST_TIMEOUT_MS = 20000;
const READ_TIMEOUT_MS = 9000;
const IDLE_RECONNECT_MS = 20000;

let inflight = 0;
let lastActivity = Date.now();

function isReadRequest(req: Request): boolean {
  if (req.method === "GET") return true;
  return req.method === "POST" && /\/filter\/?$/.test(new URL(req.url, "http://x").pathname);
}

// v3.180 — a read that hangs on a stale database connection is now retried ONCE,
// inside the same request, on a fresh connection, instead of answering 504 and
// leaving the retry to the browser (Vercel logs, 26 Nov: /api/settings/* kept
// answering 504 after 9 s while the next request a moment later answered 200).
// Only for cheap, idempotent reads (GET and POST .../filter under /api/settings
// and /api/entities): first attempt 4 s, then a new connection and a second
// attempt of 5 s — the same 9 s budget as before. Writes and heavy routes
// (functions, backups, migrations, ...) are unchanged.
const RETRY_FIRST_MS = 4000;
const RETRY_SECOND_MS = 5000;

function canRetryRead(req: Request): boolean {
  if (!isReadRequest(req)) return false;
  return /^\/api\/(settings|entities)\//.test(new URL(req.url, "http://x").pathname);
}

// resolves to the response, or to null when it took longer than `ms`
async function attempt(req: Request, ms: number): Promise<Response | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = route(req).then(withCors);
  // if the work finishes late anyway, that must not become an unhandled rejection
  work.catch(() => {});
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logTimeout(req: Request, ms: number, what: string): void {
  // the 504 used to leave no trace; now the route and the load are in the Vercel
  // logs (filter: "[timeout]")
  try {
    console.warn(`[timeout] ${what} ${req.method} ${new URL(req.url, "http://x").pathname} > ${ms} ms (inflight ${inflight})`);
  } catch {
    // logging must never break the response
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (inflight === 0 && Date.now() - lastActivity > IDLE_RECONNECT_MS) reconnect();
  inflight++;
  try {
    const retry = canRetryRead(req);
    const firstMs = retry ? RETRY_FIRST_MS : isReadRequest(req) ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    // the body of a POST .../filter can be read only once: keep a copy for the retry
    const spare = retry ? req.clone() : null;

    let res = await attempt(req, firstMs);
    if (res) return res;
    logTimeout(req, firstMs, spare ? "1st attempt" : "request");
    reconnect();

    if (spare) {
      res = await attempt(spare, RETRY_SECOND_MS);
      if (res) return res;
      logTimeout(req, RETRY_SECOND_MS, "retry");
      reconnect();
    }
    return withCors(
      new Response(JSON.stringify({ error: "Заявката отне твърде дълго време" }), {
        status: 504,
        headers: { "content-type": "application/json" },
      }),
    );
  } finally {
    inflight--;
    lastActivity = Date.now();
  }
}
