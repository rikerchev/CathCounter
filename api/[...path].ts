import { handleRequest } from "../server/router.js";

// Vercel Functions entry point (Node.js runtime — needed for a raw TCP
// connection to Postgres; the Edge runtime can't do that). This single
// catch-all file handles every /api/* request in the SAME Vercel project as
// the frontend, so the whole app is: GitHub repo -> this one Vercel
// project (frontend + API) -> Supabase Postgres. No separate backend
// hosting account needed.
//
// Vercel's Node.js runtime expects the DEFAULT EXPORT ITSELF to be the
// (request: Request) => Response handler — not an object with a `fetch`
// property (that shape is the Cloudflare Workers/Deno Deploy convention and
// Vercel does not recognize it, which made every /api/* request 404).
export default function handler(request: Request): Response | Promise<Response> {
  return handleRequest(request);
}
