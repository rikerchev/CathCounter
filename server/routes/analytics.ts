import { sql } from "../db.js";
import { env } from "../env.js";
import { sha256Hex } from "../lib/hash.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

// v3.164 — visit statistics of the public (static) pages: /ribolovno-prilozhenie,
// its siblings and the 17-language /xx/... versions (public/*.html).
//
// Privacy by design: no cookie, no IP, no user agent is stored. A page view keeps
// only the page path, the language folder, the referrer's host, the country (from
// the host's own geo header) and a coarse device class. "Unique visitors" use a
// hash of IP + user agent + the DAY + the server secret — it can't be reversed and
// changes every day, so nobody can be followed from one day to the next (the
// numbers are therefore "visitors per day", summed over the chosen period).
//
//   POST /api/analytics/pv        public — called by /t.js from every public page
//   GET  /api/analytics/summary   admin only — ?days=7|30|90|365
//
// The table is created on first use (same statement as the v3.164 migration).

const LANGS = new Set(["cs", "de", "en", "es", "fr", "hu", "it", "mk", "nl", "pl", "ro", "ru", "sk", "sr", "tr", "uk"]);
const PATH_RE = /^\/[a-z0-9\-/]{0,120}$/i;
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|monitor|curl|wget|python|node-fetch|axios/i;
const RETENTION_DAYS = 400;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function ensureTable(): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS page_views (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      path TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'bg',
      ref_host TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT 'desktop',
      visitor_hash TEXT NOT NULL
    )
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at)`);
  await sql.unsafe(`ALTER TABLE page_views ENABLE ROW LEVEL SECURITY`);
}

function deviceOf(ua: string): string {
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

function refHostOf(ref: unknown): string {
  if (typeof ref !== "string" || !ref) return "";
  try {
    return new URL(ref).hostname.replace(/^www\./, "").toLowerCase().slice(0, 100);
  } catch {
    return "";
  }
}

async function recordView(req: Request): Promise<Response> {
  let body: { p?: unknown; r?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 204 });
  }
  const rawPath = typeof body.p === "string" ? body.p.split(/[?#]/)[0] : "";
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const ua = req.headers.get("user-agent") || "";
  if (!PATH_RE.test(path) || !ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });

  const first = path.split("/")[1] || "";
  const lang = LANGS.has(first) ? first : "bg";
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const visitor = await sha256Hex(`${env.JWT_SECRET}|${day}|${ip}|${ua}`);
  const country = (req.headers.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 2);
  const refHost = refHostOf(body.r);

  const insert = () => sql`
    INSERT INTO page_views (path, lang, ref_host, country, device, visitor_hash)
    VALUES (${path}, ${lang}, ${refHost}, ${country}, ${deviceOf(ua)}, ${visitor})
  `;
  try {
    await insert();
  } catch (e) {
    if (e instanceof Error && /page_views/.test(e.message)) {
      try {
        await ensureTable();
        await insert();
      } catch (e2) {
        console.error("page view could not be recorded:", e2);
      }
    } else {
      console.error("page view could not be recorded:", e);
    }
  }
  return new Response(null, { status: 204 });
}

// views + visitors (visitors counted per day, then summed) grouped by `expr`.
async function breakdown(expr: string, days: number, limit: number) {
  return sql.unsafe(
    `SELECT key, SUM(views)::int AS views, SUM(visitors)::int AS visitors FROM (
       SELECT ${expr} AS key,
              (created_at AT TIME ZONE 'Europe/Sofia')::date AS d,
              COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
       FROM page_views
       WHERE created_at >= now() - ($1 || ' days')::interval
       GROUP BY 1, 2
     ) t GROUP BY key ORDER BY views DESC LIMIT ${limit}`,
    [String(days)],
  );
}

async function summary(url: URL): Promise<Response> {
  const requested = Number(url.searchParams.get("days"));
  const days = [7, 30, 90, 365].includes(requested) ? requested : 30;
  try {
    // Old rows are dropped here (cheap, runs only when the admin looks).
    await sql.unsafe(`DELETE FROM page_views WHERE created_at < now() - interval '${RETENTION_DAYS} days'`);
    const daily = await sql.unsafe(
      `SELECT to_char((created_at AT TIME ZONE 'Europe/Sofia')::date, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
       FROM page_views
       WHERE created_at >= now() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1`,
      [String(days)],
    );
    const [pages, langs, referrers, countries, devices] = await Promise.all([
      breakdown("path", days, 300),
      breakdown("lang", days, 30),
      breakdown("CASE WHEN ref_host = '' THEN '' ELSE ref_host END", days, 30),
      breakdown("country", days, 30),
      breakdown("device", days, 5),
    ]);
    const totals = (daily as unknown as { views: number; visitors: number }[]).reduce(
      (a, r) => ({ views: a.views + r.views, visitors: a.visitors + r.visitors }),
      { views: 0, visitors: 0 },
    );
    return json({ days, totals, daily, pages, langs, referrers, countries, devices });
  } catch (e) {
    if (e instanceof Error && /page_views/.test(e.message)) {
      // Nothing recorded yet (table not created) — an empty report.
      return json({ days, totals: { views: 0, visitors: 0 }, daily: [], pages: [], langs: [], referrers: [], countries: [], devices: [] });
    }
    throw e;
  }
}

export async function handleAnalyticsRoute(
  req: Request,
  path: string[], // ["pv"] | ["summary"]
  user: AuthUser | null,
): Promise<Response> {
  if (req.method === "POST" && path[0] === "pv") return recordView(req);
  if (req.method === "GET" && path[0] === "summary") {
    if (!user || !isAdmin(user)) return json({ error: "Forbidden" }, 403);
    return summary(new URL(req.url));
  }
  return json({ error: "Not found" }, 404);
}
