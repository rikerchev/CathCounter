// AUTO-GENERATED from base44/entities/*.jsonc — do not hand-edit column lists here,
// regenerate from the .jsonc files instead if the schema changes upstream.
// deno-lint-ignore-file

export type ColumnType = "string" | "number" | "integer" | "boolean" | "enum";

export interface EntityColumn {
  name: string;
  type: ColumnType;
  enumValues?: string[];
  required?: boolean;
}

export type AccessRule =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "admin_only" }
  | { kind: "owner"; field: string }
  | { kind: "relation_owner"; fk: string; table: string }
  | { kind: "owner_or_relation"; field: string; fk: string; table: string };

export interface EntityDef {
  name: string;
  table: string;
  columns: EntityColumn[];
  rules: { read: AccessRule; create: AccessRule; update: AccessRule; delete: AccessRule };
}

export const ENTITIES: Record<string, EntityDef> = {
  AdSlot: {
    name: "AdSlot",
    table: "ad_slots",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "placement", type: "enum", required: true, enumValues: ["all", "home", "session", "log_catch", "history", "sessions", "statistics", "locations", "personal_best", "bait_inventory", "water_bodies", "competitions", "sector_reservations", "advertise", "profile"] },
      { name: "price_per_month", type: "number", required: true },
      { name: "country_pricing", type: "string", required: false },
      { name: "is_available", type: "boolean", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["available", "rented"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  AdSlotRequest: {
    name: "AdSlotRequest",
    table: "ad_slot_requests",
    columns: [
      { name: "ad_slot_id", type: "string", required: true },
      { name: "ad_slot_name", type: "string", required: false },
      { name: "placement", type: "string", required: false },
      { name: "advertiser_email", type: "string", required: true },
      { name: "advertiser_name", type: "string", required: false },
      { name: "ad_title", type: "string", required: false },
      { name: "ad_description", type: "string", required: false },
      { name: "ad_cta", type: "string", required: false },
      { name: "website_url", type: "string", required: true },
      { name: "logo_url", type: "string", required: false },
      { name: "ad_logo_size", type: "enum", required: false, enumValues: ["16x16", "32x16", "48x16", "auto"] },
      { name: "ad_bg_class", type: "string", required: false },
      { name: "ad_text_class", type: "string", required: false },
      { name: "months", type: "integer", required: true },
      { name: "additional_info", type: "string", required: false },
      { name: "price_per_month", type: "number", required: false },
      { name: "total_price", type: "number", required: false },
      { name: "countries", type: "string", required: false },
      { name: "country_pricing", type: "string", required: false },
      { name: "country_content", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["pending", "approved", "rejected", "paid", "cancelled"] },
      { name: "checkout_url", type: "string", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "admin_only" },
    },
  },
  AppLanguage: {
    name: "AppLanguage",
    table: "app_languages",
    columns: [
      { name: "code", type: "string", required: true },
      { name: "name", type: "string", required: true },
      { name: "native_name", type: "string", required: false },
      { name: "is_active", type: "boolean", required: false },
      { name: "sort_order", type: "integer", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  Bait: {
    name: "Bait",
    table: "baits",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "category", type: "enum", required: false, enumValues: ["rod", "groundbait", "bait", "hook", "line", "other"] },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  BaseItem: {
    name: "BaseItem",
    table: "base_items",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "category", type: "enum", required: true, enumValues: ["groundbait", "bait"] },
      { name: "brand", type: "string", required: true },
      { name: "shop_url", type: "string", required: false },
      { name: "image_url", type: "string", required: false },
      { name: "description", type: "string", required: false },
      { name: "is_active", type: "boolean", required: false },
      { name: "sort_order", type: "integer", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  Catch: {
    name: "Catch",
    table: "catches",
    columns: [
      { name: "rod", type: "integer", required: true, enumValues: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
      { name: "rod_model", type: "string", required: false },
      { name: "bait", type: "string", required: false },
      { name: "hook_size", type: "string", required: false },
      { name: "line", type: "string", required: false },
      { name: "feeder", type: "string", required: false },
      { name: "rig_details", type: "string", required: false },
      { name: "distance", type: "string", required: false },
      { name: "location", type: "string", required: false },
      { name: "latitude", type: "number", required: false },
      { name: "longitude", type: "number", required: false },
      { name: "duration", type: "integer", required: false },
      { name: "weight", type: "number", required: false },
      { name: "photo_url", type: "string", required: false },
      { name: "species", type: "string", required: false },
      { name: "air_temperature", type: "number", required: false },
      { name: "cloudiness", type: "enum", required: false, enumValues: ["clear", "partly_cloudy", "cloudy", "overcast"] },
      { name: "wind_speed", type: "number", required: false },
      { name: "notes", type: "string", required: false },
      { name: "date", type: "string", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  Competition: {
    name: "Competition",
    table: "competitions",
    columns: [
      { name: "water_body_id", type: "string", required: true },
      { name: "water_body_name", type: "string", required: false },
      { name: "title", type: "string", required: true },
      { name: "fishing_type", type: "enum", required: true, enumValues: ["feeder", "float", "carp", "predator", "match", "other"] },
      { name: "max_participants", type: "integer", required: true },
      { name: "max_reserves", type: "integer", required: false },
      { name: "conditions", type: "string", required: false },
      { name: "prize_fund", type: "string", required: false },
      { name: "fee", type: "number", required: false },
      { name: "date", type: "string", required: true },
      { name: "registration_deadline", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["open", "closed", "completed", "cancelled"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "relation_owner", fk: "water_body_id", table: "water_bodies" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  CompetitionRegistration: {
    name: "CompetitionRegistration",
    table: "competition_registrations",
    columns: [
      { name: "competition_id", type: "string", required: true },
      { name: "participant_name", type: "string", required: true },
      { name: "participant_phone", type: "string", required: false },
      { name: "slot_type", type: "enum", required: false, enumValues: ["main", "reserve"] },
      { name: "payment_status", type: "enum", required: false, enumValues: ["pending", "paid", "transferred"] },
      { name: "status", type: "enum", required: false, enumValues: ["active", "cancelled"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  CustomAd: {
    name: "CustomAd",
    table: "custom_ads",
    columns: [
      { name: "title", type: "string", required: true },
      { name: "description", type: "string", required: true },
      { name: "cta", type: "string", required: false },
      { name: "link", type: "string", required: true },
      { name: "logo_url", type: "string", required: false },
      { name: "logo_size", type: "enum", required: false, enumValues: ["16x16", "32x16", "48x16", "auto"] },
      { name: "bg_class", type: "string", required: false },
      { name: "text_class", type: "string", required: false },
      { name: "is_active", type: "boolean", required: false },
      { name: "placement", type: "enum", required: false, enumValues: ["all", "home", "session", "log_catch", "history", "sessions", "statistics", "locations", "personal_best", "bait_inventory", "water_bodies", "competitions", "sector_reservations", "advertise", "profile"] },
      { name: "sort_order", type: "integer", required: false },
      // Where this banner renders on the page, and how much space it takes.
      // Added v2.46 so several banners can be active on the same placement
      // at once, stacked with a gap — see src/hooks/useEligibleAds.js /
      // src/components/AdBanner.jsx / src/components/BottomAdBanner.jsx.
      { name: "banner_position", type: "enum", required: false, enumValues: ["top", "bottom"] },
      { name: "banner_size", type: "enum", required: false, enumValues: ["compact", "normal", "large"] },
      { name: "ad_slot_id", type: "string", required: false },
      { name: "advertiser_id", type: "string", required: false },
      { name: "countries", type: "string", required: false },
      { name: "country_content", type: "string", required: false },
      { name: "language_content", type: "string", required: false },
      // Which app UI language(s) this ad is targeted to ("all", or a
      // comma-separated list of language codes like "bg,ru"). Lets the same
      // placement carry a different sponsor per language: an ad targeted to
      // just "bg" leaves that placement free for another ad targeted to
      // "en" or any other language.
      { name: "languages", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["active", "pending_review"] },
      // --- Billing period / renewal notices (added v2.38) ---
      // Plain contact email for renewal notices — independent of
      // advertiser_id (which is the ownership/access-control link to a
      // registered user and may be unset for an ad added directly by the
      // admin without the advertiser having an account).
      { name: "advertiser_email", type: "string", required: false },
      // "YYYY-MM-DD" activation date. Left null = no expiry tracked for
      // this ad (e.g. a permanent house ad) — the renewal cron ignores it.
      { name: "starts_at", type: "string", required: false },
      // Number of PAID calendar months, per the proration rule in
      // src/lib/adBilling.js (the remainder of the activation month is
      // free). Null alongside starts_at = no expiry tracked.
      { name: "duration_months", type: "integer", required: false },
      // "YYYY-MM-DD" — computed client-side from starts_at + duration_months
      // via computeAdExpiry() and stored here (not recomputed server-side)
      // so the renewal cron can query it directly.
      { name: "expires_at", type: "string", required: false },
      // Idempotency flags for the renewal cron (server/routes/adRenewals.ts)
      // — each notice fires at most once per billing period. Reset to
      // false by the client whenever starts_at/duration_months change
      // (a renewal), so the next period gets its own notices.
      { name: "renewal_notice_sent", type: "boolean", required: false },
      { name: "expiry_notice_sent", type: "boolean", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "owner", field: "advertiser_id" },
      delete: { kind: "admin_only" },
    },
  },
  MenuGroup: {
    name: "MenuGroup",
    table: "menu_groups",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "description", type: "string", required: false },
      { name: "menu_items", type: "string", required: true },
      { name: "status", type: "enum", required: false, enumValues: ["active", "inactive"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  Notification: {
    name: "Notification",
    table: "notifications",
    columns: [
      { name: "user_id", type: "string", required: true },
      { name: "type", type: "enum", required: false, enumValues: ["competition", "system", "info"] },
      { name: "title", type: "string", required: true },
      { name: "message", type: "string", required: false },
      { name: "link", type: "string", required: false },
      { name: "read", type: "boolean", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "user_id" },
      create: { kind: "admin_only" },
      update: { kind: "owner", field: "user_id" },
      delete: { kind: "owner", field: "user_id" },
    },
  },
  RoleRequest: {
    name: "RoleRequest",
    table: "role_requests",
    columns: [
      { name: "requested_role", type: "enum", required: true, enumValues: ["water_owner", "advertiser", "admin"] },
      { name: "user_email", type: "string", required: true },
      { name: "user_name", type: "string", required: false },
      { name: "reason", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["pending", "approved", "rejected"] },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  SectorAvailability: {
    name: "SectorAvailability",
    table: "sector_availabilities",
    columns: [
      { name: "water_body_id", type: "string", required: true },
      { name: "water_body_name", type: "string", required: false },
      { name: "date", type: "string", required: true },
      { name: "end_date", type: "string", required: false },
      { name: "total_sectors", type: "integer", required: true },
      { name: "fee_per_person", type: "number", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["open", "closed"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "relation_owner", fk: "water_body_id", table: "water_bodies" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  SectorReservation: {
    name: "SectorReservation",
    table: "sector_reservations",
    columns: [
      { name: "water_body_id", type: "string", required: true },
      { name: "water_body_name", type: "string", required: false },
      { name: "availability_id", type: "string", required: false },
      { name: "date", type: "string", required: true },
      { name: "sector_number", type: "integer", required: true },
      { name: "reserved_by_name", type: "string", required: true },
      { name: "reserved_by_phone", type: "string", required: false },
      { name: "fee", type: "number", required: false },
      { name: "payment_status", type: "enum", required: false, enumValues: ["pending", "paid", "refunded"] },
      { name: "status", type: "enum", required: false, enumValues: ["active", "cancelled"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "authenticated" },
      update: { kind: "owner_or_relation", field: "created_by_id", fk: "water_body_id", table: "water_bodies" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  SessionSync: {
    name: "SessionSync",
    table: "session_syncs",
    columns: [
      { name: "session_data", type: "string", required: true },
      { name: "is_active", type: "boolean", required: false },
      { name: "device_id", type: "string", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  Subscription: {
    name: "Subscription",
    table: "subscriptions",
    columns: [
      { name: "client_reference_id", type: "string", required: true },
      { name: "stripe_customer_id", type: "string", required: false },
      { name: "stripe_subscription_id", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["active", "canceled", "past_due", "incomplete"] },
      { name: "current_period_end", type: "string", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "client_reference_id" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  Translation: {
    name: "Translation",
    table: "translations",
    columns: [
      { name: "key", type: "string", required: true },
      { name: "values", type: "string", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "admin_only" },
      update: { kind: "admin_only" },
      delete: { kind: "admin_only" },
    },
  },
  UserInventory: {
    name: "UserInventory",
    table: "user_inventories",
    columns: [
      { name: "item_name", type: "string", required: true },
      { name: "category", type: "enum", required: true, enumValues: ["groundbait", "bait", "rod", "hook", "line", "feeder", "other"] },
      { name: "brand", type: "string", required: false },
      { name: "quantity", type: "number", required: false },
      { name: "unit", type: "enum", required: false, enumValues: ["g", "kg", "pcs", "ml", "l"] },
      { name: "description", type: "string", required: false },
      { name: "shop_url", type: "string", required: false },
    ],
    rules: {
      read: { kind: "owner", field: "created_by_id" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  WaterBody: {
    name: "WaterBody",
    table: "water_bodies",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "owner_name", type: "string", required: false },
      { name: "contact_phone", type: "string", required: true },
      { name: "contact_email", type: "string", required: false },
      { name: "location", type: "string", required: true },
      { name: "country", type: "string", required: false },
      { name: "region", type: "string", required: false },
      { name: "latitude", type: "number", required: false },
      { name: "longitude", type: "number", required: false },
      { name: "usage_conditions", type: "string", required: true },
      { name: "fish_population", type: "string", required: true },
      { name: "max_depth", type: "number", required: false },
      { name: "capacity", type: "string", required: false },
      { name: "fee_per_person", type: "number", required: false },
      { name: "iban", type: "string", required: false },
      { name: "logo_url", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["pending", "approved", "rejected"] },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES);