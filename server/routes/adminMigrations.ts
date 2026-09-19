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
            WHERE table_schema = 'public' AND table_name = 'competitions' AND constraint_name = 'competitions_fishing_type_check'
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
            WHERE table_schema = 'public' AND table_name = 'competition_registrations' AND column_name = 'assigned_box' AND data_type <> 'text'
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
  "v2.90-competition-registration-order": {
    label: "v2.90 — Записвания за състезания: пореден номер и назначаване на потребител",
    run: async () => {
      // v2.90 — list_order_at: see the matching column comment in
      // entities.generated.ts (drives the participant list's display
      // order). assigned_user_email: set only by the dedicated reassign
      // endpoint (server/routes/competitionRegistrations.ts), never
      // generically writable — a snapshot of which system account a
      // registration was manually assigned to, kept separate from
      // registered_by_email (who originally submitted it).
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS list_order_at TEXT`);
      await sql.unsafe(`ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_user_email TEXT`);
    },
  },
  "v2.96-sector-box-labels-scheme-image": {
    label: "v2.96 — Именувани сектори/боксове за резервация + снимка на схема на водоема",
    run: async () => {
      // v2.96 — mirrors the v2.83/2.84 competition boxes model (named
      // labels, not just an auto-numbered range), applied here to the
      // GENERAL date-based reservation system (SectorAvailability/
      // SectorReservation, "Резервации" menu) instead of competitions.
      // box_labels: optional JSON string[] on SectorAvailability — when
      // absent (any row created before this version), the app falls back
      // to the legacy 1..total_sectors numbering, so nothing existing
      // breaks. sector_number moves from INTEGER to TEXT on
      // SectorReservation so a reservation can hold a custom label
      // ("VIP-1"), not just a number — existing integer values are cast to
      // their text form automatically. scheme_image_url: a photo of the
      // water body's own layout/map, uploaded once per water body (not per
      // date) from the same "Одобрени водоеми" screen the sectors/boxes are
      // declared from, shown to anyone reserving as a purely visual
      // reference — no coordinates/parsing, see src/lib/brochure.js's
      // UploadFile pattern (same underlying Postgres-backed photo storage
      // as catch photos and ad logos, not the optional S3 integration).
      await sql.unsafe(`ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS box_labels TEXT`);
      await sql.unsafe(`ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS scheme_image_url TEXT`);
      await sql.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'sector_reservations' AND column_name = 'sector_number' AND data_type <> 'text'
          ) THEN
            ALTER TABLE sector_reservations ALTER COLUMN sector_number TYPE TEXT USING sector_number::text;
          END IF;
        END $$;
      `);
    },
  },
  "v2.97-contact-messages": {
    label: "v2.97 — Връзка с нас: съобщения от потребители",
    run: async () => {
      // See server/routes/contact.ts — every submission is both stored here
      // (so nothing is lost if the notification email fails/is delayed) and
      // emailed to the fixed site-owner address.
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_contact_messages_user_id ON contact_messages(user_id)`);
    },
  },
  "v2.98-terms-acceptance": {
    label: "v2.98 — Задължително приемане на общите условия",
    run: async () => {
      // NULL = never accepted yet — every account that existed before this
      // migration (and every Google sign-in, which has no registration-form
      // checkbox of its own) starts out NULL and is blocked behind
      // TermsGate.jsx (src/App.jsx) until they click through it once. See
      // middleware/auth.ts and routes/auth.ts's "accept-terms" action.
      await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`);
    },
  },
  "v3.03-user-phone": {
    label: "v3.03 — Телефон на потребителя",
    run: async () => {
      // NULL on every account created before this — see Register.jsx (Name+
      // Phone shown right after the terms checkbox) and Profile.jsx (lets a
      // Google-OAuth account, or anyone who skipped it, fill it in later).
      // Used to auto-fill the phone field on a registrant's first
      // competition registration (Competitions.jsx) and gives the site
      // owner/organizers a direct-contact option per the mandatory phone-at-
      // registration request.
      await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
    },
  },
  "v3.04-reservation-sectors-config": {
    label: "v3.04 — Резервации: именувани сектори и боксове",
    run: async () => {
      // Same {name, boxes} model as Competition.sectors_config (v2.83/2.84,
      // see src/lib/competitionSectors.js) — reused here so the general
      // (non-competition) reservation system can also have named sector
      // GROUPS, not just one flat list of boxes. See src/lib/sectorLabels.js
      // for the full fallback chain (sectors_config -> box_labels ->
      // sequential 1..total_sectors) that keeps every existing availability
      // working unchanged.
      await sql.unsafe(`ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS sectors_config TEXT`);
    },
  },
  "v3.06-venue-hours-and-sector-defaults": {
    label: "v3.06 — Работно време на обекти + запомнени сектори/боксове",
    run: async () => {
      // Free-text working hours (e.g. "06:00 - 20:00" or "Денонощно"),
      // shown publicly on water bodies (Competitions.jsx/
      // SectorReservations.jsx/WaterBodies.jsx) and commercial venues
      // (CommercialVenues.jsx). See WaterBodyEditDialog.jsx / TraderVenues.jsx.
      await sql.unsafe(`ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS working_hours TEXT`);
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS working_hours TEXT`);
      // Per-opening override for the water body's own working_hours above —
      // pre-filled from it when a new SectorAvailability is opened
      // (WaterBodyManagement.jsx), editable per period since a specific
      // opening (e.g. a holiday, a competition weekend) can run different
      // hours than usual. Shown to whoever reserves that period
      // (SectorReservations.jsx).
      await sql.unsafe(`ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS working_hours TEXT`);
      // Remembers the last-used {name, boxes} sector/box layout for a water
      // body (see src/lib/sectorLabels.js's stringifySectorsConfig), so
      // opening a NEW SectorAvailability pre-fills the sector editor
      // instead of resetting to a blank 10-box default every time — see
      // WaterBodyManagement.jsx's openSectorForm/createSectorAvailability.
      await sql.unsafe(`ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS default_sectors_config TEXT`);
    },
  },
  "v3.11-reservation-arrival-time": {
    label: "v3.11 — Резервации: ориентировъчен час на пристигане",
    run: async () => {
      // See the matching column comment in entities.generated.ts — a
      // no-show in the early morning shouldn't read as a cancelled
      // reservation to the water body owner when the customer simply
      // plans to arrive later that day.
      await sql.unsafe(`ALTER TABLE sector_reservations ADD COLUMN IF NOT EXISTS arrival_time TEXT`);
    },
  },
  "v3.26-merchant-banner-rotation": {
    label: "v3.26 — Размер на лого на обекти + завъртане на търговци в банер",
    run: async () => {
      // logo_size on venues — same enum custom_ads.logo_size already offers
      // (TraderVenues.jsx), so a venue's own logo keeps its chosen aspect
      // when later snapshotted into an ad banner below.
      await sql.unsafe(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_size TEXT CHECK (logo_size IN ('16x16', '32x16', '48x16', 'auto'))`);
      // merchants: JSON array of denormalized merchant snapshots
      // ([{type, id, name, logo_url, logo_size}, ...], in rotation order)
      // an admin attaches to a banner from CustomAds.jsx's "Търговци в
      // банера" section — not a live join, so the ad-rendering hot path
      // (every page load) never needs an extra fetch. See
      // src/components/AdBannerItem.jsx for the rotation-resolution logic.
      await sql.unsafe(`ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS merchants TEXT`);
      // Rotation interval in MINUTES regardless of the UI unit picked
      // (minute/hour/day); unused when merchants has 0 or 1 entries.
      await sql.unsafe(`ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS merchant_rotation_minutes INTEGER`);
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
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'premium_until'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.69-venues") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'water_bodies' AND column_name = 'bonus_days_per_referral'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.71-venue-contact") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'website'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.77-venue-status") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.80-competition-registered-by") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'competition_registrations' AND column_name = 'registered_by_email'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.83-competition-sectors-boxes") {
        // Checks assigned_box is TEXT specifically (not just present) so
        // this still shows "not applied" — safe to click again — if an
        // earlier partial run left it as the old INTEGER type (v2.84 fix).
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'competition_registrations' AND column_name = 'assigned_box' AND data_type = 'text'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.87-competition-results") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'competition_registrations' AND column_name = 'catch_results'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.90-competition-registration-order") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'competition_registrations' AND column_name = 'list_order_at'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.96-sector-box-labels-scheme-image") {
        // Checks sector_number is TEXT specifically (not just box_labels'
        // presence) so this stays "not applied" — safe to click again — if
        // an earlier partial run added box_labels/scheme_image_url but the
        // ALTER COLUMN TYPE step didn't complete.
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sector_reservations' AND column_name = 'sector_number' AND data_type = 'text'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.97-contact-messages") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'contact_messages'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v2.98-terms-acceptance") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'terms_accepted_at'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v3.03-user-phone") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v3.04-reservation-sectors-config") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sector_availabilities' AND column_name = 'sectors_config'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v3.06-venue-hours-and-sector-defaults") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND (
            (table_name = 'water_bodies' AND column_name IN ('working_hours', 'default_sectors_config'))
             OR (table_name = 'venues' AND column_name = 'working_hours')
             OR (table_name = 'sector_availabilities' AND column_name = 'working_hours')
          )
        `;
        applied = (rows[0]?.n ?? 0) >= 4;
      }
      if (id === "v3.11-reservation-arrival-time") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sector_reservations' AND column_name = 'arrival_time'
        `;
        applied = (rows[0]?.n ?? 0) > 0;
      }
      if (id === "v3.26-merchant-banner-rotation") {
        const rows = await sql<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND (
            (table_name = 'venues' AND column_name = 'logo_size')
             OR (table_name = 'custom_ads' AND column_name IN ('merchants', 'merchant_rotation_minutes'))
          )
        `;
        applied = (rows[0]?.n ?? 0) >= 3;
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
