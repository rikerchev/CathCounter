import { env } from "./env.ts";
import { getUserFromRequest } from "./middleware/auth.ts";
import { handleAuthRoute } from "./routes/auth.ts";
import { handleEntitiesRoute } from "./routes/entities.ts";
import { handleFunctionsRoute } from "./routes/functions.ts";
import { handleUploadsRoute } from "./routes/uploads.ts";
import { handleIntegrationsRoute } from "./routes/integrations.ts";
import { handleAdminSettingsRoute } from "./routes/adminSettings.ts";

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

async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
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
    if (segments[1] === "uploads") {
      return await handleUploadsRoute(req, user);
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

Deno.serve({ port: env.PORT }, async (req) => {
  const res = await router(req);
  return withCors(res);
});

console.log(`CatchCount API listening on :${env.PORT}`);
