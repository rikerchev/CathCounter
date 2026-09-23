-- Auto-generated from base44/entities/*.jsonc — CatchCount self-hosted schema
-- Generated once; edit the resulting migration by hand from here on, this is not re-run automatically.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,                 -- NULL if the account only ever used Google login
  google_id TEXT UNIQUE,
  full_name TEXT,
  -- Single "primary" role (kept for simple checks/back-compat) plus the
  -- multi-role array the frontend actually reads/writes (src/lib/roles.js) —
  -- a user can be e.g. both water_owner and advertiser at once.
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','water_owner','advertiser')),
  roles TEXT[] NOT NULL DEFAULT '{}',
  country TEXT,
  menu_group_id UUID,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,              -- 'verify_email' | 'password_reset'
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_codes_email ON otp_codes(email);

-- Powers the in-app Setup Wizard (admin-only): lets an admin paste in
-- Google OAuth / S3 / Resend / Stripe / LLM credentials through the UI
-- instead of editing server/.env and restarting. DATABASE_URL and JWT_SECRET
-- can't live here (you need a DB connection before you can read this table),
-- so those two stay in .env — everything else can be set from either place,
-- with a value here taking priority (see server/lib/settings.ts).
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  placement TEXT CHECK (placement IN ('all', 'home', 'session', 'log_catch', 'history', 'sessions', 'statistics', 'locations', 'personal_best', 'bait_inventory', 'water_bodies', 'competitions', 'sector_reservations', 'advertise', 'profile')) DEFAULT 'all',
  price_per_month DOUBLE PRECISION DEFAULT 0,
  country_pricing TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  status TEXT CHECK (status IN ('available', 'rented')) DEFAULT 'available',
  -- Where the "advertise here" placeholder banner renders for this slot
  -- while it has no advertiser yet, and how much space it takes — same
  -- fields/values as custom_ads.banner_position/banner_size (v2.46), added
  -- v2.49 so an admin-defined, still-unrented slot shows up live on the
  -- site with the standard invite-to-advertise text instead of being
  -- invisible until someone actually rents it. See useEligibleAds.js.
  banner_position TEXT CHECK (banner_position IN ('top', 'bottom')) DEFAULT 'top',
  banner_size TEXT CHECK (banner_size IN ('compact', 'normal', 'large')) DEFAULT 'normal',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_slots_created_by ON ad_slots(created_by_id);

CREATE TABLE ad_slot_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_slot_id TEXT,
  ad_slot_name TEXT,
  placement TEXT,
  advertiser_email TEXT,
  advertiser_name TEXT,
  ad_title TEXT,
  ad_description TEXT,
  ad_cta TEXT,
  website_url TEXT,
  logo_url TEXT,
  ad_logo_size TEXT CHECK (ad_logo_size IN ('16x16', '32x16', '48x16', 'auto')) DEFAULT 'auto',
  ad_bg_class TEXT DEFAULT 'bg-gradient-to-r from-cyan-600 to-blue-600',
  ad_text_class TEXT DEFAULT 'text-white',
  months INTEGER DEFAULT 1,
  additional_info TEXT,
  price_per_month DOUBLE PRECISION,
  total_price DOUBLE PRECISION,
  countries TEXT,
  country_pricing TEXT,
  country_content TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')) DEFAULT 'pending',
  checkout_url TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_slot_requests_created_by ON ad_slot_requests(created_by_id);

CREATE TABLE app_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT,
  name TEXT,
  native_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_languages_created_by ON app_languages(created_by_id);

CREATE TABLE baits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  category TEXT CHECK (category IN ('rod', 'groundbait', 'bait', 'hook', 'line', 'other')) DEFAULT 'bait',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_baits_created_by ON baits(created_by_id);

CREATE TABLE base_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  category TEXT CHECK (category IN ('groundbait', 'bait')) DEFAULT 'groundbait',
  brand TEXT,
  shop_url TEXT,
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_base_items_created_by ON base_items(created_by_id);

CREATE TABLE catches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rod INTEGER CHECK (rod IN ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')) DEFAULT 1,
  rod_model TEXT,
  bait TEXT,
  hook_size TEXT,
  line TEXT,
  feeder TEXT,
  rig_details TEXT,
  distance TEXT,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  duration INTEGER DEFAULT 0,
  weight DOUBLE PRECISION,
  photo_url TEXT,
  species TEXT,
  air_temperature DOUBLE PRECISION,
  cloudiness TEXT CHECK (cloudiness IN ('clear', 'partly_cloudy', 'cloudy', 'overcast')),
  wind_speed DOUBLE PRECISION,
  notes TEXT,
  date TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catches_created_by ON catches(created_by_id);

-- Catch photos are stored directly in the database (BYTEA) instead of an
-- external object store (S3/R2/B2/...) — no separate paid file-storage
-- account is needed. The client compresses every photo to roughly
-- 100-150KB before upload (src/lib/imageCompression.js) specifically so a
-- large number of catches still fit inside a free-tier Postgres database
-- (e.g. Supabase's free plan). catches.photo_url holds the URL
-- (/api/catch-photos/:id) that serves the bytes below.
CREATE TABLE catch_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data BYTEA NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_catch_photos_created_by ON catch_photos(created_by_id);

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  water_body_id TEXT,
  water_body_name TEXT,
  title TEXT,
  -- v2.83: was CHECK (fishing_type IN (...)) — dropped (see the v2.83 ALTER
  -- block near the bottom of this file) so the organizer can type any text
  -- instead of picking from a fixed list. Shown here without the CHECK, for
  -- a fresh database; existing databases need the migration to drop it.
  fishing_type TEXT DEFAULT 'feeder',
  max_participants INTEGER DEFAULT 20,
  max_reserves INTEGER DEFAULT 5,
  conditions TEXT,
  prize_fund TEXT,
  fee DOUBLE PRECISION DEFAULT 0,
  date TEXT,
  registration_deadline TEXT,
  status TEXT CHECK (status IN ('open', 'closed', 'completed', 'cancelled')) DEFAULT 'open',
  -- v2.83: JSON-encoded sectors. v2.84: each sector holds its own list of
  -- individually named/numbered boxes: [{name, boxes: [...]}, ...] — see
  -- the matching column comment in server/schema/entities.generated.ts.
  sectors_config TEXT,
  -- v2.87: how many rounds ("манш") this competition is fished over. NULL/
  -- unset reads as 1 (a single overall weigh-in) client-side.
  rounds_count INTEGER,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_competitions_created_by ON competitions(created_by_id);

CREATE TABLE competition_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id TEXT,
  participant_name TEXT,
  participant_phone TEXT,
  slot_type TEXT CHECK (slot_type IN ('main', 'reserve')) DEFAULT 'main',
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'transferred')) DEFAULT 'pending',
  status TEXT CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
  -- v2.83: set by the organizer's "draw lots" action — see the matching
  -- column comments in server/schema/entities.generated.ts. v2.84:
  -- assigned_box is TEXT (was INTEGER) — boxes now carry organizer-chosen
  -- labels, not just an auto-numbered sequence.
  assigned_sector TEXT,
  assigned_box TEXT,
  -- v2.87: JSON-encoded per-round catch weight in kg, e.g. "[12.5,null,8.3]"
  -- — see the matching column comment in server/schema/entities.generated.ts.
  catch_results TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_competition_registrations_created_by ON competition_registrations(created_by_id);

CREATE TABLE custom_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  cta TEXT,
  link TEXT,
  logo_url TEXT,
  logo_size TEXT CHECK (logo_size IN ('16x16', '32x16', '48x16', 'auto')) DEFAULT 'auto',
  -- v3.26 — one or more approved merchants (water_bodies/venues) attached to
  -- this banner by an admin (CustomAds.jsx "Търговци в банера"). JSON array
  -- of denormalized snapshots taken at attach time —
  -- [{type, id, name, logo_url, logo_size}, ...], in rotation order — same
  -- JSON-in-TEXT pattern as country_content/language_content below, so the
  -- ad-rendering hot path never needs an extra fetch. See the ALTER TABLE
  -- note near the bottom of this file for existing databases, and
  -- src/components/AdBannerItem.jsx for the rotation-resolution logic.
  merchants TEXT,
  -- Rotation interval in MINUTES regardless of the UI unit picked
  -- (minute/hour/day); unused when merchants has 0 or 1 entries.
  merchant_rotation_minutes INTEGER,
  bg_class TEXT DEFAULT 'bg-gradient-to-r from-cyan-600 to-blue-600',
  text_class TEXT DEFAULT 'text-white',
  is_active BOOLEAN DEFAULT TRUE,
  placement TEXT CHECK (placement IN ('all', 'home', 'session', 'log_catch', 'history', 'sessions', 'statistics', 'locations', 'personal_best', 'bait_inventory', 'water_bodies', 'competitions', 'sector_reservations', 'advertise', 'profile')) DEFAULT 'all',
  sort_order INTEGER DEFAULT 0,
  -- Where this banner renders, and how much space it takes — added v2.46 so
  -- several banners can be active on the same placement at once, stacked
  -- with a gap between them, instead of only ever one banner per page.
  banner_position TEXT CHECK (banner_position IN ('top', 'bottom')) DEFAULT 'top',
  banner_size TEXT CHECK (banner_size IN ('compact', 'normal', 'large')) DEFAULT 'normal',
  ad_slot_id TEXT,
  advertiser_id TEXT,
  countries TEXT DEFAULT 'all',
  country_content TEXT,
  language_content TEXT,
  -- Which app UI language(s) this ad is targeted to ("all", or a
  -- comma-separated list like "bg,ru"). Added in v2.30 so the same
  -- placement can carry a different sponsor per language — see the
  -- `ALTER TABLE` note near the bottom of this file for existing databases.
  languages TEXT DEFAULT 'all',
  status TEXT CHECK (status IN ('active', 'pending_review')) DEFAULT 'active',
  -- Billing period / renewal notices, added v2.38 — see the ALTER TABLE
  -- note near the bottom of this file for existing databases, and
  -- src/lib/adBilling.js for the proration rule and src/pages/CustomAds.jsx
  -- / server/routes/adRenewals.ts for how they're used.
  advertiser_email TEXT,
  starts_at TEXT,
  duration_months INTEGER,
  expires_at TEXT,
  renewal_notice_sent BOOLEAN DEFAULT FALSE,
  expiry_notice_sent BOOLEAN DEFAULT FALSE,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_ads_created_by ON custom_ads(created_by_id);
CREATE INDEX idx_custom_ads_expires_at ON custom_ads(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE menu_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  description TEXT,
  menu_items TEXT,
  status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_groups_created_by ON menu_groups(created_by_id);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  type TEXT CHECK (type IN ('competition', 'system', 'info')) DEFAULT 'info',
  title TEXT,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_created_by ON notifications(created_by_id);

CREATE TABLE role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_role TEXT CHECK (requested_role IN ('water_owner', 'advertiser', 'admin')),
  user_email TEXT,
  user_name TEXT,
  reason TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_role_requests_created_by ON role_requests(created_by_id);

CREATE TABLE sector_availabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  water_body_id TEXT,
  water_body_name TEXT,
  date TEXT,
  end_date TEXT,
  total_sectors INTEGER DEFAULT 10,
  fee_per_person DOUBLE PRECISION DEFAULT 0,
  status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sector_availabilities_created_by ON sector_availabilities(created_by_id);

CREATE TABLE sector_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  water_body_id TEXT,
  water_body_name TEXT,
  availability_id TEXT,
  date TEXT,
  sector_number INTEGER,
  reserved_by_name TEXT,
  reserved_by_phone TEXT,
  arrival_time TEXT,
  fee DOUBLE PRECISION DEFAULT 0,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'refunded')) DEFAULT 'pending',
  status TEXT CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sector_reservations_created_by ON sector_reservations(created_by_id);

CREATE TABLE session_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_data TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  device_id TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_syncs_created_by ON session_syncs(created_by_id);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_reference_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete')) DEFAULT 'incomplete',
  current_period_end TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_created_by ON subscriptions(created_by_id);

CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT,
  values TEXT DEFAULT '{}',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_translations_created_by ON translations(created_by_id);

CREATE TABLE user_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT,
  category TEXT CHECK (category IN ('groundbait', 'bait', 'rod', 'hook', 'line', 'feeder', 'other')) DEFAULT 'bait',
  brand TEXT,
  quantity DOUBLE PRECISION DEFAULT 0,
  unit TEXT CHECK (unit IN ('g', 'kg', 'pcs', 'ml', 'l')) DEFAULT 'g',
  description TEXT,
  shop_url TEXT,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_inventories_created_by ON user_inventories(created_by_id);

CREATE TABLE water_bodies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  owner_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  location TEXT,
  country TEXT,
  region TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  usage_conditions TEXT,
  fish_population TEXT,
  max_depth DOUBLE PRECISION,
  capacity TEXT,
  fee_per_person DOUBLE PRECISION DEFAULT 0,
  iban TEXT,
  logo_url TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_water_bodies_created_by ON water_bodies(created_by_id);

-- Leftover from the (now removed) Stripe Connect payout flow — no code
-- reads or writes this column anymore. Kept only so an already-migrated
-- database doesn't need a destructive column drop; safe to ignore or drop
-- yourself later.
ALTER TABLE water_bodies ADD COLUMN stripe_account_id TEXT;

-- v2.30: per-language ad targeting (custom_ads.languages) — run this once
-- against an existing database that was created before this column was
-- added above.
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS languages TEXT DEFAULT 'all';

-- v2.38: billing period / renewal notices (custom_ads) — run this once
-- against an existing database that was created before these columns were
-- added above. Safe to re-run.
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS advertiser_email TEXT;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS starts_at TEXT;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS duration_months INTEGER;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS expires_at TEXT;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS renewal_notice_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS expiry_notice_sent BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_custom_ads_expires_at ON custom_ads(expires_at) WHERE expires_at IS NOT NULL;

-- v2.46: banner stacking position (top/bottom) and size — run this once
-- against an existing database that was created before these columns
-- existed (custom_ads). Safe to re-run.
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS banner_position TEXT DEFAULT 'top';
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS banner_size TEXT DEFAULT 'normal';

-- v2.49: same banner_position/banner_size fields on ad_slots, so a
-- still-unrented slot's "advertise here" placeholder banner can use the
-- admin's chosen position/size instead of always defaulting to top/normal.
-- Safe to re-run.
ALTER TABLE ad_slots ADD COLUMN IF NOT EXISTS banner_position TEXT DEFAULT 'top';
ALTER TABLE ad_slots ADD COLUMN IF NOT EXISTS banner_size TEXT DEFAULT 'normal';

-- v2.68: QR referral/sharing system (Табло → "Покани приятел") — grants
-- stacking, capped, ad-free premium time to both the person who shares
-- their invite QR/link and the person who scans it and registers. Safe to
-- re-run. This is applied automatically by the "Приложи обновление" button
-- in Admin → Настройка → База данни (server/routes/adminMigrations.ts) —
-- there is no need to run this file by hand for this version; it is kept
-- here only as the documented reference copy, same as every entry above.
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);

-- v2.69: brochure QR codes for "Търговци" (Водоеми + Търговски обекти) —
-- a printed brochure's QR encodes a specific merchant (water body or
-- commercial venue) directly (no GPS/location guessing). When someone
-- registers through it, that ONE merchant can earn free banner-advertising
-- time (bonus_days_per_referral, applied to linked_custom_ad_id — both 0/
-- unset by default, i.e. no banner, until the owner/admin configures them
-- in Търговци → Водоеми / Търговски обекти). Safe to re-run. Applied via
-- the same "Приложи обновление" admin button as v2.68 — see
-- server/routes/adminMigrations.ts.
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS bonus_days_per_referral INTEGER NOT NULL DEFAULT 0;
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS linked_custom_ad_id UUID REFERENCES custom_ads(id) ON DELETE SET NULL;

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
);
CREATE INDEX IF NOT EXISTS idx_venues_created_by ON venues(created_by_id);

-- One row per NEW ACCOUNT that ever redeemed a merchant brochure QR (see
-- server/routes/merchantReferrals.ts) — referred_id UNIQUE makes it
-- one-time, merchant_type/merchant_id together say which water body or
-- venue gets the credit (and the bonus banner days, if any are configured).
CREATE TABLE IF NOT EXISTS merchant_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_type TEXT NOT NULL CHECK (merchant_type IN ('water_body', 'venue')),
  merchant_id UUID NOT NULL,
  referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchant_referrals_merchant ON merchant_referrals(merchant_type, merchant_id);

-- v2.71: public-facing contact/branding fields for a commercial venue — the
-- new "Търговски обекти" browse menu (src/pages/CommercialVenues.jsx, public,
-- analogous to "Водоеми"/water_bodies) shows these so an angler can actually
-- contact a venue or visit its site, not just see its name. All optional —
-- a venue created before this migration (or without these filled in) simply
-- shows without that row on its card. Same names as the equivalent
-- water_bodies columns (contact_phone, contact_email, logo_url) on purpose.
-- Safe to re-run. Applied via the same "Приложи обновление" admin button —
-- see server/routes/adminMigrations.ts.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- v2.77: commercial venues now go through the same admin-approval workflow
-- as water bodies (see AdminTraders.jsx, the merged "Търговци" admin
-- screen). DEFAULT 'approved' (not 'pending') so every already-live venue
-- stays visible on /commercial-venues without needing re-approval — new
-- venues are created with an explicit status: "pending" by the client
-- (MerchantRequest.jsx). Safe to re-run. Applied via the same "Приложи
-- обновление" admin button as v2.68/v2.69/v2.71 — see
-- server/routes/adminMigrations.ts.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('pending','approved','rejected')) NOT NULL DEFAULT 'approved';

-- v2.80: snapshot of the logged-in account's email at the moment of a
-- competition registration (participant_name is free-typed and can name
-- someone else, e.g. a family member) — lets the organizer's participant
-- list (WaterBodyManagement.jsx, "Участници" dialog + CSV export) always
-- trace a registration back to a real account. Never written to after
-- create. Safe to re-run. Applied via the same "Приложи обновление" admin
-- button as v2.68/v2.69/v2.71/v2.77 — see server/routes/adminMigrations.ts.
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS registered_by_email TEXT;

-- v2.83: (1) fishing_type on competitions becomes free text — drop its old
-- fixed-list CHECK constraint (auto-named by Postgres as
-- "<table>_<column>_check" since it was declared inline with no explicit
-- name). (2) sectors_config on competitions holds the organizer's named
-- sectors (JSON). (3) assigned_sector/assigned_box on
-- competition_registrations hold each participant's drawn box. v2.84:
-- assigned_box is created/kept as TEXT, not INTEGER — the ALTER COLUMN TYPE
-- block below defensively converts it if an earlier partial run of this
-- same migration already created it as INTEGER. Safe to re-run either way.
-- Applied via the same "Приложи обновление" admin button as
-- v2.68/v2.69/v2.71/v2.77/v2.80 — see server/routes/adminMigrations.ts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'competitions' AND constraint_name = 'competitions_fishing_type_check'
  ) THEN
    ALTER TABLE competitions DROP CONSTRAINT competitions_fishing_type_check;
  END IF;
END $$;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS sectors_config TEXT;
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_sector TEXT;
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_box TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competition_registrations' AND column_name = 'assigned_box' AND data_type <> 'text'
  ) THEN
    ALTER TABLE competition_registrations ALTER COLUMN assigned_box TYPE TEXT USING assigned_box::TEXT;
  END IF;
END $$;

-- v2.87: multi-round ("манш") catch-weight results. rounds_count on
-- competitions is how many rounds it's fished over (NULL/unset reads as 1
-- client-side). catch_results on competition_registrations is a
-- JSON-encoded array of that participant's per-round weight in kg — see the
-- matching column comments in server/schema/entities.generated.ts and
-- src/lib/competitionResults.js. Safe to re-run. Applied via the same
-- "Приложи обновление" admin button as the migrations above — see
-- server/routes/adminMigrations.ts.
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rounds_count INTEGER;
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS catch_results TEXT;

-- v2.90: list_order_at (ISO timestamp, set by the organizer's "edit
-- participant" dialog on every save) drives the participants list's
-- display order — see the matching column comment in
-- server/schema/entities.generated.ts. assigned_user_email is set only by
-- the dedicated reassign endpoint (server/routes/competitionRegistrations.ts),
-- never through the generic entity update path — a snapshot of which system
-- account a registration is currently assigned to, kept separate from
-- registered_by_email (who originally submitted it). Safe to re-run.
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS list_order_at TEXT;
ALTER TABLE competition_registrations ADD COLUMN IF NOT EXISTS assigned_user_email TEXT;

-- v2.96: box_labels on sector_availabilities is a JSON-encoded array of
-- custom box/sector names (string[]), mirroring the sectors_config box
-- naming already used by competitions since v2.84 — see src/lib/sectorLabels.js
-- and the matching column comment in server/schema/entities.generated.ts.
-- NULL/empty falls back to plain sequential numbering ("1".."total_sectors").
-- scheme_image_url on water_bodies is an uploaded reference photo/map of the
-- water body's layout (Postgres-backed storage via /api/catch-photos, same
-- mechanism as catch photos and ad logos — not the optional S3 integration).
-- sector_number on sector_reservations is widened from INTEGER to TEXT so it
-- can hold a chosen custom box label instead of only a numeric index — same
-- pattern as assigned_box on competition_registrations (v2.84 block above).
-- Safe to re-run. Applied via the same "Приложи обновление" admin button as
-- the migrations above — see server/routes/adminMigrations.ts.
ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS box_labels TEXT;
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS scheme_image_url TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sector_reservations' AND column_name = 'sector_number' AND data_type <> 'text'
  ) THEN
    ALTER TABLE sector_reservations ALTER COLUMN sector_number TYPE TEXT USING sector_number::text;
  END IF;
END $$;

-- v2.97: "Връзка с нас" (Contact Us) — messages submitted by users, always
-- both stored here and emailed to the fixed site-owner address (see
-- server/routes/contact.ts). Safe to re-run. Applied via the same "Приложи
-- обновление" admin button as the migrations above.
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_user_id ON contact_messages(user_id);

-- v2.98: mandatory Terms & Conditions acceptance — NULL means never accepted
-- (blocks the app behind TermsGate.jsx, see server/routes/auth.ts's
-- "accept-terms" action and middleware/auth.ts). Safe to re-run. Applied via
-- the same "Приложи обновление" admin button as the migrations above.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- v3.03: the user's own phone number — collected at registration
-- (Register.jsx, right after the terms checkbox) or filled in later from
-- Profile.jsx, so an organizer always has a direct-contact option for
-- whoever registers for their competitions. Safe to re-run. Applied via the
-- same "Приложи обновление" admin button as the migrations above.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- v3.04: named sector GROUPS (each with its own individually-labeled boxes)
-- for the general reservation system, same {name, boxes} JSON model as
-- Competition.sectors_config — see src/lib/sectorLabels.js's fallback chain
-- and src/lib/competitionSectors.js. Safe to re-run. Applied via the same
-- "Приложи обновление" admin button as the migrations above.
ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS sectors_config TEXT;

-- v3.06: free-text working hours on water bodies and commercial venues
-- (e.g. "06:00 - 20:00" or "Денонощно"), a per-opening working-hours
-- override on sector_availabilities (pre-filled from the water body's own,
-- editable per period), and a remembered last-used {name, boxes} sector/box
-- layout per water body (default_sectors_config, same JSON model as
-- sector_availabilities.sectors_config) so opening a new period pre-fills
-- the sector editor instead of resetting to a blank default every time. See
-- WaterBodyEditDialog.jsx, TraderVenues.jsx, WaterBodyManagement.jsx. Safe
-- to re-run. Applied via the same "Приложи обновление" admin button as the
-- migrations above.
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS working_hours TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS working_hours TEXT;
ALTER TABLE sector_availabilities ADD COLUMN IF NOT EXISTS working_hours TEXT;
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS default_sectors_config TEXT;

-- v3.11: free-text approximate arrival time on a sector reservation (e.g.
-- "около 10:00") — the water body owner's own explicit ask, so a customer
-- who simply plans to arrive later in the day doesn't get mistaken for a
-- no-show/cancelled reservation. Shown to the owner alongside the rest of
-- the reservation (WaterBodyManagement.jsx) and to the customer in their
-- own booking form (SectorReservations.jsx), and included in both emails
-- notify-sector-reservation sends. Safe to re-run. Applied via the same
-- "Приложи обновление" admin button as the migrations above.
ALTER TABLE sector_reservations ADD COLUMN IF NOT EXISTS arrival_time TEXT;

-- v3.26: admin-assigned merchant banner rotation. (1) logo_size on venues —
-- same enum custom_ads.logo_size already offers, so a venue's own logo can
-- keep its chosen aspect when it's later snapshotted into an ad banner (see
-- below). (2)+(3) on custom_ads: merchants is a JSON array of denormalized
-- merchant snapshots ([{type, id, name, logo_url, logo_size}, ...], in
-- rotation order) an admin attaches to a banner from CustomAds.jsx's
-- "Търговци в банера" section — not a live join, so the ad-rendering hot
-- path (every page load) never needs an extra fetch; merchant_rotation_minutes
-- is the rotation interval in minutes regardless of which UI unit
-- (minute/hour/day) the admin picked, unused when merchants has 0 or 1
-- entries. See src/components/AdBannerItem.jsx for the rotation-resolution
-- logic. Safe to re-run. Applied via the same "Приложи обновление" admin
-- button as the migrations above.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_size TEXT CHECK (logo_size IN ('16x16', '32x16', '48x16', 'auto'));
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS merchants TEXT;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS merchant_rotation_minutes INTEGER;

-- v3.28: enables Postgres Row-Level Security on every public table, with no
-- policies attached to any of them. This is purely a defense-in-depth
-- closure of Supabase's automated "Table is publicly accessible" security
-- scan (server/db.ts connects with the project's own DATABASE_URL, i.e. the
-- default Supabase-provisioned "postgres" role, which OWNS every table
-- here — and a table owner is exempt from RLS by default whether or not RLS
-- is enabled on it, unless FORCE ROW LEVEL SECURITY is also set, which this
-- deliberately does NOT do). So this has zero effect on the app's own
-- queries (all of them go through server/db.ts as that owning role); all it
-- does is stop Supabase's own PostgREST/GraphQL auto-API (a separate,
-- unrelated access path this app has never used — no @supabase/supabase-js
-- client or anon key is ever shipped to the browser, see src/api/
-- base44Client.js) from being able to read/write these tables for anyone
-- who might otherwise reach it with just the project's public anon key.
-- Safe to re-run. Applied via the same "Приложи обновление" admin button as
-- the migrations above.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_slot_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE baits ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catches ENABLE ROW LEVEL SECURITY;
ALTER TABLE catch_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- v3.29: role_key marks a menu_groups row as the auto-managed system group
-- for a given role ("water_owner" = "Търговец"/"собственик на водоем" in the
-- UI, or "advertiser") — see server/lib/roleGroups.ts. NULL (the default)
-- for every ordinary, admin-created group; at most one row per role value
-- (enforced by the partial unique index below, so INSERT ... ON CONFLICT
-- (role_key) in adminMigrations.ts always finds/creates exactly one). The
-- two rows themselves, and backfilling any already-approved user into
-- theirs, are created by the "v3.29-role-menu-groups" admin migration, not
-- here — this file only owns the schema, not seed data (see this file's own
-- header comment). Safe to re-run.
ALTER TABLE menu_groups ADD COLUMN IF NOT EXISTS role_key TEXT CHECK (role_key IN ('water_owner', 'advertiser'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_groups_role_key ON menu_groups(role_key) WHERE role_key IS NOT NULL;

-- v3.30: per-banner-slot ad SOURCE selection (Google AdSense / own ads /
-- partner-merchant ads — Admin → Рекламни слотове → per-zone "Източник"),
-- weighted merchant rotation by QR-code referral count, and rotation among
-- several own ads sharing one banner slot.
--
-- ad_slots.source_type: 'adsense' | 'custom' | 'merchant', default 'custom'
-- so every existing banner slot keeps today's exact behaviour (stack every
-- eligible custom_ads row) until an admin explicitly picks something else
-- for that exact placement+position in AdManagement.jsx. 'adsense' makes
-- that slot render a manual AdSense ad unit (adsense_ad_unit_id below)
-- instead of any custom_ads content; 'merchant' restricts that slot to only
-- custom_ads rows that have merchants attached (see v3.26), hiding plain
-- ads and the "advertise here" placeholder there.
--
-- ad_slots.adsense_ad_unit_id: the AdSense "Ad unit" ID (from the admin's
-- own AdSense account) to render in this slot when source_type='adsense' —
-- separate from the existing global ADSENSE_PUBLISHER_ID/ADSENSE_ENABLED
-- app_settings (server/lib/settings.ts), which still gate Google's
-- account-wide "Auto ads" script (src/components/AdSenseLoader.jsx); this
-- is what lets ONE specific slot show a manual AdSense unit instead of
-- relying on Auto ads' own free-form placement.
--
-- custom_ads.rotation_seconds: opt-in per-ad display duration, in seconds.
-- NULL/0 (default) = unchanged behaviour (this ad always shows, stacked
-- with any other ads sharing its placement+position). When 2+ active ads
-- sharing the exact same placement+position all have this set, they rotate
-- instead of stacking — each shown for its own configured number of
-- seconds in a repeating cycle (order = sort_order), switching
-- deterministically by wall-clock time so every visitor sees the same one
-- at a given moment, same "changes on next page load" rule as the existing
-- merchants-within-one-ad rotation (v3.26). See src/lib/adCache.js's
-- applyCustomAdRotation().
--
-- Safe to re-run.
ALTER TABLE ad_slots ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('adsense', 'custom', 'merchant')) DEFAULT 'custom';
ALTER TABLE ad_slots ADD COLUMN IF NOT EXISTS adsense_ad_unit_id TEXT;
ALTER TABLE custom_ads ADD COLUMN IF NOT EXISTS rotation_seconds INTEGER;
