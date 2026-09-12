import { env } from "./env.js";
import { sql } from "./db.js";
import { absoluteUrl } from "./lib/url.js";
import { getUserFromRequest } from "./middleware/auth.js";
import { handleAuthRoute } from "./routes/auth.js";
import { handleEntitiesRoute } from "./routes/entities.js";
import { handleFunctionsRoute } from "./routes/functions.js";
import { handleCatchPhotosRoute } from "./routes/catchPhotos.js";
import { handleIntegrationsRoute } from "./routes/integrations.js";
import { handleAdminSettingsRoute } from "./routes/adminSettings.js";

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
      return await handleAdminSettingsRoute(req, user);
    }
    if (segments[1] === "health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    // Hit once a day by a Vercel Cron job (see vercel.json). Actually
    // touches the database (not just a static "ok") so it counts as real
    // activity toward Supabase's free-tier "pause after 7 days with no
    // database activity" rule — see docs on that pausing behavior:
    // https://supabase.com/docs/guides/platform/free-project-pausing
    // This is unrelated to (and does not replace) the query-timeout /
    // auto-reconnect logic in db.ts, which is what actually fixed the
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

export async function handleRequest(req: Request): Promise<Response> {
  const res = await route(req);
  return withCors(res);
}
