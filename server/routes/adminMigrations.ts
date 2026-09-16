import { sql } from "../db.js";
import type { AuthUser } from "../middleware/auth.js";
import { isAdmin } from "../middleware/auth.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Small, self-serve alternative to `cd server && npm run migrate` for the
// non-technical, GitHub-Desktop-only workflow this app is normally deployed
// with: a code push (git) already ships automatically via Vercel, but a
// schema change historically needed someone to run server/scripts/migrate.mjs
// by hand against DATABASE_URL — a terminal step outside that workflow.
//
// Deliberately NOT "replay the whole of schema.sql": most of schema.sql's
// original CREATE TABLE statements have no IF NOT EXISTS, so re-running the
// full file against an already-set-up database fails immediately (and, since
// a multi-statement simple-query call is one implicit transaction, rolls
// back everything in that call — including any later, actually-new
// statements). Each entry below is instead its own tiny, hand-picked,
// 100% idempotent (IF NOT EXISTS / IF NOT EXISTS-only) statement set, safe
// to click more than once — see schema.sql's matching versioned comment for
// the documented, reference copy of the same SQL.
const MIGRATIONS: Record<string, { label: string; run: () => Promise<void> }> = {
  "v2.68-referrals": {
    label: "v2.68 — QR покани и premium без реклами",
    run: async () => {
      await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ`);
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS referrals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_id)
        )
      `);
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id)`);
    },
  },
  "v2.69-venues": {
    label: "v2.69 — Търговци: брошури и бонус реклами",
    run: async () => {
      await sql.unsafe(`ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS bonus_days_per_referral INTEGER NOT NULL DEFAULT 0`);
      await sql.unsafe(`ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS linked_custom_ad_id UUID REFERENCES custom_ads(id) ON DELETE SET NULL`);
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS venues (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          address TEXT,
          bonus_days_per_referral INTEGER NOT NULL DEFAULT 0,
          linked_custom_ad_id UUID REFERENCES custom_ads(id) ON DELETE SET NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_venues_created_by ON venues(created_by_id)`);
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS merchant_referrals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_type TEXT NOT NULL CHECK (merchant_type IN ('water_body', 'venue')),
          merchant_id UUID NOT NULL,
          referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_merchant_referrals_merchant ON merchant_referrals(merchant_type, merchant_id)`);
    },
  },
  "v2.71-venue-contact": {
    label: "v2.71 — Търговски обекти: контакти и лого",
    run: async () => {
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_phone TEXT`);
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_email TEXT`);
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS website TEXT`);
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_url TEXT`);
    },
  },
  "v2.77-venue-status": {
    label: "v2.77 — Търговски обекти: одобрение от админ",
    run: async () => {
      // DEFAULT 'approved' (not 'pending', unlike water_bodies) — venues had
      // no approval step before this; defaulting existing rows to 'approved'
      // keeps every already-live venue visible on /commercial-venues without
      // needing manual re-approval. New venues are created with an explicit
      // status: "pending" by the client (MerchantRequest.jsx) regardless of
      // this column default.
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('pending','approved','rejected')) NOT NULL DEFAULT 'approved'`);
    },
  },
  "v2.80-competition-registered-by": {
    label: "v2.80 — Записвания за състезания: акаунт на регистриралия",
    run: async () => {
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS registered_by_email TEXT`);
    },
  },
  "v2.83-competition-sectors-boxes": {
    label: "v2.83/2.84 — Състезания: свободен вид риболов, сектори/боксове, жребий",
    run: async () => {
      // Drop the old fixed-list CHECK on fishing_type so it accepts free
      // text. Auto-named by Postgres (inline CHECK, no explicit name).
      await sql.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'competitions' AND constraint_name = 'competitions_fishing_type_check'
          ) THEN
            ALTER TABLE competitions DROP CONSTRAINT competitions_fishing_type_check;
          END IF;
        END $$;
      `);
      await sql.unsafe(`ALTER TABLE competitions ADD COLUMN IF NOT EXISTS sectors_config TEXT`);
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_sector TEXT`);
      // v2.84 — assigned_box is TEXT, not INTEGER: boxes now carry
      // organizer-chosen labels, not just an auto-numbered sequence. The
      // ALTER COLUMN TYPE below defensively converts it if an earlier
      // partial run of this same migration id already created it as
      // INTEGER — safe/idempotent either way.
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_box TEXT`);
      await sql.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'competition_registrations' AND column_name = 'assigned_box' AND data_type <> 'text'
          ) THEN
            ALTER TABLE competition_registrations ALTER COLUMN assigned_box TYPE TEXT USING assigned_box::TEXT;
          END IF;
        END $$;
      `);
    },
  },
  "v2.87-competition-results": {
    label: "v2.87 — Състезания: манши и тегло на улова",
    run: async () => {
      await sql.unsafe(`ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rounds_count INTEGER`);
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS catch_results TEXT`);
    },
  },
};

/**
 * GET  /api/admin/migrations         -> { [id]: { label, applied } } (admin only)
 * POST /api/admin/migrations/:id     -> applies it, { success: true } (admin only)
 *
 * "applied" is detected by probing for the thing the migration creates,
 * not by a separate ledger table — one less thing that can drift out of
 * sync with reality.
 */
export async function handleAdminMigrationsRoute(
  req: Request,
  path: string[],
  user: AuthUser | null,
): Promise<Response> {
  if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);

  if (path.length === 0 && req.method === "GET") {
    const out: Record<string, { label: string; applied: boolean }> = {};
    for (const [id, m] of Object.entries(MIGRATIONS)) {
      let applied = false;
      if (id === "v2.68-referrals") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'premium_until'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.69-venues") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'water_bodies' AND column_name = 'bonus_days_per_referral'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.71-venue-contact") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'venues' AND column_name = 'website'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.77-venue-status") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'venues' AND column_name = 'status'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.80-competition-registered-by") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'competition_registrations' AND column_name = 'registered_by_email'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.83-competition-sectors-boxes") {
        // Checks assigned_box is TEXT specifically (not just present) so
        // this still shows "not applied" — safe to click again — if an
        // earlier partial run left it as the old INTEGER type (v2.84 fix).
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'competition_registrations' AND column_name = 'assigned_box' AND data_type = 'text'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.87-competition-results") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'competition_registrations' AND column_name = 'catch_results'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      out[id] = { label: m.label, applied };
    }
    return json(out);
  }

  if (path[0] && req.method === "POST") {
    const migration = MIGRATIONS[path[0]];
    if (!migration) return json({ error: "Unknown migration" }, 404);
    try {
      await migration.run();
      return json({ success: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Migration failed" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}
