// Node alternative to `deno task migrate`. Applies server/schema/schema.sql
// to DATABASE_URL. The backend itself (main.ts) still needs Deno to run —
// this script exists only so the one-off migration step doesn't require
// installing Deno first. Usage:
//   cd server
//   npm install
//   npm run migrate

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, "..");

// Tiny inline .env parser — no extra dependency needed for `KEY=VALUE` lines.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(serverDir, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in first.",
  );
  process.exit(1);
}

const schemaPath = join(serverDir, "schema", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const client = new pg.Client({
  connectionString: databaseUrl,
  // Local Postgres (no TLS) and most managed providers (TLS, self-signed
  // chain) both need this off for a zero-config connection string to work.
  ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
});

try {
  console.log(
    "Applying server/schema/schema.sql to",
    databaseUrl.replace(/:[^:@]+@/, ":****@"),
  );
  await client.connect();
  await client.query(schema);
  console.log("Done.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
