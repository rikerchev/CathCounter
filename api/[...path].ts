import { handleRequest } from "../server/router.ts";

// Vercel Functions entry point (Node.js runtime — needed for a raw TCP
// connection to Postgres; the Edge runtime can't do that). This single
// catch-all file handles every /api/* request in the SAME Vercel project as
// the frontend, so the whole app is: GitHub repo -> this one Vercel
// project (frontend + API) -> Supabase Postgres. No separate backend
// hosting account needed.
export default {
  fetch: handleRequest,
};
