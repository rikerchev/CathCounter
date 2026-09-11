import postgres from "postgres";
import { env } from "../env.ts";

const schemaPath = new URL("../schema/schema.sql", import.meta.url);
const schema = await Deno.readTextFile(schemaPath);

const sql = postgres(env.DATABASE_URL, { ssl: "prefer" });

console.log("Applying server/schema/schema.sql to", env.DATABASE_URL.replace(/:[^:@]+@/, ":****@"));
await sql.unsafe(schema);
console.log("Done.");
await sql.end();
