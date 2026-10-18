import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// v3.120 — anonymous, read-only feed of OTHER anglers' catches for the
// "Всички риболовци" statistics tab (free for every signed-in user).
//
// Deliberately NOT the generic Catch entity endpoint (whose read rule is
// "owner"): this returns only the fields statistics needs — no user id/name,
// no notes, no photo, no rod/rig details — and rounds coordinates to 3 decimals
// (~100 m), enough to group by water body but not to pinpoint a swim, and
// blanks a location that is just raw coordinates (would defeat the rounding). The
// caller's own catches are excluded (the client already has them locally,
// including unsynced ones).
const LIMIT = 5000;

export async function handleCommunityRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (!user) return json({ error: "Unauthorized" }, 401);

  if (req.method === "GET" && path[0] === "catches") {
    const me = user.id;
    try {
      const rows = await sql`
        SELECT id, species, bait, hook_size, line, feeder, feeder2, distance,
               CASE WHEN location ~ '^[[:space:]]*-?[0-9.]+[[:space:]]*,[[:space:]]*-?[0-9.]+[[:space:]]*$' THEN NULL ELSE location END AS location,
               ROUND(latitude::numeric, 3)::float8 AS latitude,
               ROUND(longitude::numeric, 3)::float8 AS longitude,
               water_name, duration, weight, air_temperature, cloudiness,
               wind_speed, date, created_at
        FROM catches
        WHERE created_by_id IS DISTINCT FROM ${me}
        ORDER BY created_at DESC
        LIMIT ${LIMIT}
      `;
      return json(rows);
    } catch {
      // water_name column not created yet (v3.120 migration not applied) —
      // still serve everything else.
      const rows = await sql`
        SELECT id, species, bait, hook_size, line, feeder, NULL::text AS feeder2, distance,
               CASE WHEN location ~ '^[[:space:]]*-?[0-9.]+[[:space:]]*,[[:space:]]*-?[0-9.]+[[:space:]]*$' THEN NULL ELSE location END AS location,
               ROUND(latitude::numeric, 3)::float8 AS latitude,
               ROUND(longitude::numeric, 3)::float8 AS longitude,
               NULL::text AS water_name, duration, weight, air_temperature, cloudiness,
               wind_speed, date, created_at
        FROM catches
        WHERE created_by_id IS DISTINCT FROM ${me}
        ORDER BY created_at DESC
        LIMIT ${LIMIT}
      `;
      return json(rows);
    }
  }

  return json({ error: "Not found" }, 404);
}
