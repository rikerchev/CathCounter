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

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  water_body_id TEXT,
  water_body_name TEXT,
  title TEXT,
  fishing_type TEXT CHECK (fishing_type IN ('feeder', 'float', 'carp', 'predator', 'match', 'other')) DEFAULT 'feeder',
  max_participants INTEGER DEFAULT 20,
  max_reserves INTEGER DEFAULT 5,
  conditions TEXT,
  prize_fund TEXT,
  fee DOUBLE PRECISION DEFAULT 0,
  date TEXT,
  registration_deadline TEXT,
  status TEXT CHECK (status IN ('open', 'closed', 'completed', 'cancelled')) DEFAULT 'open',
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
  bg_class TEXT DEFAULT 'bg-gradient-to-r from-cyan-600 to-blue-600',
  text_class TEXT DEFAULT 'text-white',
  is_active BOOLEAN DEFAULT TRUE,
  placement TEXT CHECK (placement IN ('all', 'home', 'session', 'log_catch', 'history', 'sessions', 'statistics', 'locations', 'personal_best', 'bait_inventory', 'water_bodies', 'competitions', 'sector_reservations', 'advertise', 'profile')) DEFAULT 'all',
  sort_order INTEGER DEFAULT 0,
  ad_slot_id TEXT,
  advertiser_id TEXT,
  countries TEXT DEFAULT 'all',
  country_content TEXT,
  language_content TEXT,
  status TEXT CHECK (status IN ('active', 'pending_review')) DEFAULT 'active',
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_ads_created_by ON custom_ads(created_by_id);

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

-- Manual addition: base44/functions/create-stripe-connect-account and the
-- checkout functions read/write water_body.stripe_account_id, but it isn't
-- declared in base44/entities/WaterBody.jsonc (Base44 must have tracked it as
-- an internal/system field). Added here so Stripe Connect payouts keep working.
ALTER TABLE water_bodies ADD COLUMN stripe_account_id TEXT;
