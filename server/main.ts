import "dotenv/config";
import { createServer } from "node:http";
import { createServerAdapter } from "@whatwg-node/server";
import { env } from "./env.ts";
import { handleRequest } from "./router.ts";

// Standalone entry point — only needed if you ever want to self-host this
// backend as one long-running process (a VPS, Render, Railway, ...) instead
// of Vercel Functions. Not used by the Vercel deployment itself (see
// api/[...path].ts at the repo root, which wraps the exact same
// server/router.ts). Plain Node.js — no Deno anywhere.
const adapter = createServerAdapter(handleRequest);

createServer(adapter).listen(env.PORT, () => {
  console.log(`CatchCount API listening on :${env.PORT}`);
});
