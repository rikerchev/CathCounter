import { createServerAdapter } from "@whatwg-node/server";
import { handleRequest } from "../server/router.js";

// Vercel Functions entry point (Node.js runtime — needed for a raw TCP
// connection to Postgres; the Edge runtime can't do that). This single
// catch-all file handles every /api/* request in the SAME Vercel project as
// the frontend, so the whole app is: GitHub repo -> this one Vercel
// project (frontend + API) -> Supabase Postgres. No separate backend
// hosting account needed.
//
// Vercel's Node.js runtime invokes this function's default export using the
// classic Node.js (req: IncomingMessage, res: ServerResponse) convention —
// NOT a Web-standard (Request) => Response, even though that's what
// server/router.ts is written against (req.url turns out to be a relative
// path here, and req.headers a plain object with no .get(), which is what
// IncomingMessage looks like, not a Fetch API Request).
// `createServerAdapter` (from @whatwg-node/server — the same helper
// server/main.ts already uses to run this on a plain node:http server)
// bridges the two: it can be called as (req, res) OR as (Request), so the
// exact same adapter now also works as this Vercel Function's default
// export.
export default createServerAdapter(handleRequest);
