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
      // v2.49 — same fields as CustomAd, used for the "advertise here"
      // placeholder banner shown while this slot has no advertiser yet.
      { name: "banner_position", type: "enum", required: false, enumValues: ["top", "bottom"] },
      { name: "banner_size", type: "enum", required: false, enumValues: ["compact", "normal", "large"] },
      // v3.30 — which content fills this exact placement+position banner:
      // Google AdSense (a manual ad unit, adsense_ad_unit_id below),
      // "custom" (any eligible custom_ads row, today's default behaviour),
      // or "merchant" (only custom_ads rows that have merchants attached —
      // see CustomAds.jsx's "Търговци в банера"). Set from AdManagement.jsx.
      { name: "source_type", type: "enum", required: false, enumValues: ["adsense", "custom", "merchant"] },
      // The AdSense "Ad unit" ID to render here when source_type='adsense'
      // — separate from the global ADSENSE_PUBLISHER_ID/ADSENSE_ENABLED app
      // settings, which control Google's account-wide "Auto ads" script.
      { name: "adsense_ad_unit_id", type: "string", required: false },
      // v3.31 — only set for an AdSense "In-feed ad" unit (Google's code
      // for those needs both data-ad-format="fluid" AND this value; a
      // standard "Display ad" unit's code has neither, so this stays null
      // and AdSenseSlot.jsx falls back to its original rendering).
      { name: "adsense_ad_layout_key", type: "string", required: false },
      // v3.45 — "all" (default) or a comma-separated list of language
      // codes: which menu languages this slot is even eligible to appear
      // in, mirroring custom_ads.languages below. Checked BEFORE placement
      // in AdManagement.jsx's slot form, and threaded through
      // findSlotForPosition()/resolveZone() in src/lib/adCache.js.
      { name: "languages", type: "string", required: false },
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
      // v2.83 — was a fixed enum; the organizer asked for free text instead
      // (competitions don't always fit "feeder/float/carp/predator/match/
      // other"). Old rows keep whichever of those six values they already
      // had — still rendered through the fishing.* translation keys by the
      // UI for backward compatibility — new rows can be any string.
      { name: "fishing_type", type: "string", required: true },
      { name: "max_participants", type: "integer", required: true },
      { name: "max_reserves", type: "integer", required: false },
      { name: "conditions", type: "string", required: false },
      { name: "prize_fund", type: "string", required: false },
      { name: "fee", type: "number", required: false },
      { name: "date", type: "string", required: true },
      { name: "registration_deadline", type: "string", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["open", "closed", "completed", "cancelled"] },
      // v2.83 — JSON-encoded array of named sectors. v2.84 — each sector
      // holds its own list of individually named/numbered boxes (not just a
      // count), e.g. '[{"name":"А","boxes":["1","2","3"]},{"name":"Б",
      // "boxes":["10","11"]}]'. No native JSON/array ColumnType exists here
      // (see ColumnType above), so this follows the same "structured data
      // in a TEXT column" pattern as MenuGroup.menu_items. Parsed/written
      // via src/lib/competitionSectors.js. Empty/null = no sectors
      // configured yet (draw disabled in the UI).
      { name: "sectors_config", type: "string", required: false },
      // v2.87 — how many rounds ("манш") this competition is fished over.
      // Drives how many per-round weight input cells the organizer/
      // registrant sees when entering CompetitionRegistration.catch_results
      // (see src/lib/competitionResults.js). Defaults to 1 (a single
      // overall weigh-in) when unset, for competitions created before this
      // existed.
      { name: "rounds_count", type: "integer", required: false },
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
      // v2.80 — snapshot of the logged-in account's email at the moment of
      // registration (participant_name is free-typed and can be someone
      // else, e.g. a family member). Lets the organizer's participant list
      // (WaterBodyManagement.jsx) always trace a registration back to a
      // real account. Never touched after create.
      { name: "registered_by_email", type: "string", required: false },
      // v2.83 — set by the organizer's "draw lots" action (see
      // src/lib/competitionSectors.js drawBoxes()). Both null until then.
      // assigned_sector is one of the names from the competition's own
      // sectors_config. v2.84 — assigned_box was integer (auto-numbered
      // 1..boxCount); it's now the individual box's own label from that
      // sector's `boxes` array, since the organizer can name/number each
      // box independently (not necessarily sequential integers) — so this
      // is a string, not an integer.
      { name: "assigned_sector", type: "string", required: false },
      { name: "assigned_box", type: "string", required: false },
      // v2.87 — JSON-encoded array of this participant's catch weight (kg)
      // per round, e.g. "[12.5,null,8.3]" — null means that round hasn't
      // been weighed in yet. Parsed/written via
      // src/lib/competitionResults.js. Editing this goes through the same
      // `update` rule as everything else on this entity (see below), which
      // already covers exactly who this feature needs to allow: the user
      // who registered this participant, the competition's organizer, and
      // admins.
      { name: "catch_results", type: "string", required: false },
      // v2.90 — ISO timestamp set by the organizer's "edit participant"
      // dialog (WaterBodyManagement.jsx's saveRegEdit) every time it saves —
      // NOT touched by the draw, the quick payment-status toggle, or the
      // registrant's own create/cancel actions. Drives the participant
      // list's display order: whoever hasn't been edited yet is ordered by
      // created_at (first registered = first in the list); once an admin/
      // owner edits a participant, this timestamp takes over and pushes
      // them to the end of the list. Purely cosmetic ordering — never read
      // by src/lib/competitionResults.js's standings/ranking.
      { name: "list_order_at", type: "string", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "authenticated" },
      // v2.83 — was `owner` (created_by_id only), which meant only the
      // participant who submitted a registration could ever edit/cancel it —
      // the water body owner/organizer running the competition couldn't
      // touch a registration they didn't personally create. owner_or_relation
      // additionally allows whoever owns the competition itself (fk chain:
      // this row's competition_id -> competitions.created_by_id), so the
      // organizer can edit names/phones/payment status and assign draw
      // results for every participant, not just their own registrations.
      update: { kind: "owner_or_relation", field: "created_by_id", fk: "competition_id", table: "competitions" },
      delete: { kind: "owner_or_relation", field: "created_by_id", fk: "competition_id", table: "competitions" },
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
      // v3.26 — one or more approved merchants (water_bodies/venues)
      // attached to this banner by an admin in CustomAds.jsx's "Търговци в
      // банера" section. JSON array of DENORMALIZED snapshots taken at
      // attach time — [{type, id, name, logo_url, logo_size, description,
      // link}, ...] (description/link added v3.44, sourced from the
      // merchant's own venues.ad_description/ad_link at attach time), in
      // rotation order — same JSON-in-TEXT pattern as
      // country_content/language_content below, not a live join, so the
      // ad-rendering hot path (every page load) never needs an extra
      // fetch. See AdBannerItem.jsx's carousel-building logic.
      { name: "merchants", type: "string", required: false },
      // Rotation interval in MINUTES, regardless of which unit
      // (minute/hour/day) the admin picked in the UI — irrelevant/unused
      // when merchants has 0 or 1 entries. RETIRED as of v3.44 (see
      // manual_items below) — left in place, unused, for backward
      // compatibility; no longer written or read by the client.
      { name: "merchant_rotation_minutes", type: "integer", required: false },
      // v3.44 — a second kind of item that shares the SAME banner's live
      // rotation alongside `merchants` above, entered directly by the admin
      // instead of derived from an approved merchant. JSON array of
      // [{id, title, description, link, logo_url, logo_size,
      // duration_seconds}, ...] — the admin UI (CustomAds.jsx's "Ръчно
      // въведени реклами в банера" section) edits duration as a friendly
      // value+unit pair but always converts it to a plain duration_seconds
      // before saving, same as rotation_seconds below. See
      // AdBannerItem.jsx's carousel-building logic.
      { name: "manual_items", type: "string", required: false },
      // v3.30 — opt-in display duration for THIS ad, in seconds, when 2+
      // active ads share the exact same placement+position: instead of
      // stacking, they take turns, each shown for its own
      // rotation_seconds in a repeating cycle. NULL/0 (default) = this ad
      // keeps stacking as before, unaffected. Distinct from the
      // merchants-within-one-ad rotation above (merchant_rotation_minutes)
      // — this one rotates between DIFFERENT custom_ads rows. See
      // src/lib/adCache.js's applyCustomAdRotation().
      { name: "rotation_seconds", type: "integer", required: false },
      // v3.45 — how long THIS ad's own base content (title/description/
      // link/logo above) stays on screen each time its turn comes up in
      // the SAME banner's internal live carousel with its merchants/
      // manual_items — a brand-new, separate field, deliberately not
      // reusing rotation_seconds above (that one rotates entire, separate
      // custom_ads ROWS against each other; this one rotates WITHIN one
      // row). NULL/0 = the app-wide default (see AdBannerItem.jsx).
      { name: "own_content_duration_seconds", type: "integer", required: false },
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
      // v2.96 — optional JSON string[] of custom per-box labels ("1", "2",
      // "VIP-1", ...), same idea as Competition.sectors_config's boxes
      // (v2.84) but flat — a SectorAvailability is one plain list of boxes,
      // no named sub-groups. Absent/empty on any row created before v2.96
      // (or when the owner never customizes it) — the app then falls back
      // to the legacy 1..total_sectors numeric range, so old data keeps
      // working unchanged. See src/lib/sectorLabels.js.
      { name: "box_labels", type: "string", required: false },
      // v3.04 — named sector GROUPS, each with its own individually-labeled
      // boxes: '[{"name":"А","boxes":["1","2","3"]},{"name":"Б","boxes":["VIP-1"]}]',
      // same JSON model as Competition.sectors_config. Takes priority over
      // box_labels when present; see src/lib/sectorLabels.js for the full
      // fallback chain that keeps every pre-v3.04 availability working
      // unchanged.
      { name: "sectors_config", type: "string", required: false },
      { name: "fee_per_person", type: "number", required: false },
      { name: "status", type: "enum", required: false, enumValues: ["open", "closed"] },
      // v3.06 — free-text working hours for THIS opening specifically
      // (e.g. "06:00 - 20:00" or "Денонощно"), pre-filled from the water
      // body's own WaterBody.working_hours when the opening is created but
      // editable per period (a holiday/competition weekend can run
      // different hours) — see WaterBodyManagement.jsx's
      // createSectorAvailability and SectorReservations.jsx.
      { name: "working_hours", type: "string", required: false },
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
      // v2.96 — TEXT, not INTEGER: holds whichever box label the customer
      // picked (a plain number as a string for availabilities without
      // custom box_labels, or a custom label like "VIP-1"). Mirrors the
      // exact same integer→text change CompetitionRegistration.assigned_box
      // went through in v2.84, for the same reason.
      { name: "sector_number", type: "string", required: true },
      { name: "reserved_by_name", type: "string", required: true },
      { name: "reserved_by_phone", type: "string", required: false },
      // v3.11 — free-text approximate arrival time (e.g. "около 10:00",
      // "следобед") — the water body owner's own explicit ask: without it,
      // a no-show in the early morning reads exactly like a cancelled
      // reservation from the owner's side, when the customer may simply
      // plan to arrive later in the day. Shown alongside the rest of the
      // reservation (see SectorReservations.jsx / WaterBodyManagement.jsx)
      // and included in notify-sector-reservation's emails.
      // v3.12 — now required in the customer-facing reservation form (the
      // owner's own follow-up request), though still free text, not a strict
      // time format. Kept nullable at the DB level so reservations made
      // before v3.12 (which have no value here) stay valid.
      { name: "arrival_time", type: "string", required: true },
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
      // v2.69 — "Търговци" brochure QR bonus. 0 / unset by default (no
      // banner) until an admin configures them in Водоеми management. See
      // server/routes/merchantReferrals.ts.
      { name: "bonus_days_per_referral", type: "integer", required: false },
      { name: "linked_custom_ad_id", type: "string", required: false },
      // v2.96 — a photo of the water body's own sector/box layout (e.g. a
      // printed lake map), uploaded once from the same "Одобрени водоеми"
      // sector-declaration dialog the owner opens dates/boxes from — purely
      // a visual reference for whoever's reserving, shown next to the
      // custom box labels (box_labels on SectorAvailability). Uploaded via
      // base44.integrations.Core.UploadFile, same Postgres-backed photo
      // storage as catch photos and ad logos — not the optional S3
      // integration, so it works with zero extra setup.
      { name: "scheme_image_url", type: "string", required: false },
      // v3.06 — free-text working hours (e.g. "06:00 - 20:00" or
      // "Денонощно"), shown publicly wherever the water body is shown
      // (Competitions.jsx, SectorReservations.jsx, WaterBodies.jsx). See
      // WaterBodyEditDialog.jsx.
      { name: "working_hours", type: "string", required: false },
      // v3.06 — the last-used {name, boxes} sector/box layout for this water
      // body (same JSON model as SectorAvailability.sectors_config — see
      // src/lib/sectorLabels.js/competitionSectors.js), so opening a NEW
      // sector availability pre-fills the sector editor with it instead of
      // resetting to a blank default every time. Updated every time a new
      // availability is opened — see WaterBodyManagement.jsx's
      // openSectorForm/createSectorAvailability.
      { name: "default_sectors_config", type: "string", required: false },
    ],
    rules: {
      read: { kind: "public" },
      create: { kind: "authenticated" },
      update: { kind: "owner", field: "created_by_id" },
      delete: { kind: "owner", field: "created_by_id" },
    },
  },
  // v2.69 — "Търговски обекти" (Търговци → second submenu): a physical shop
  // etc. with its own brochure QR code. Same bonus-referral mechanic as
  // WaterBody above; see server/routes/merchantReferrals.ts.
  Venue: {
    name: "Venue",
    table: "venues",
    columns: [
      { name: "name", type: "string", required: true },
      { name: "address", type: "string", required: false },
      { name: "bonus_days_per_referral", type: "integer", required: false },
      { name: "linked_custom_ad_id", type: "string", required: false },
      { name: "is_active", type: "boolean", required: false },
      // v2.71 — public-facing contact/branding info, shown on the new
      // "Търговски обекти" browse page (src/pages/CommercialVenues.jsx).
      // All optional; same names as the equivalent WaterBody columns above.
      { name: "contact_phone", type: "string", required: false },
      { name: "contact_email", type: "string", required: false },
      { name: "website", type: "string", required: false },
      { name: "logo_url", type: "string", required: false },
      // v2.77 — venues now go through the same admin-approval workflow as
      // water bodies, via the merged queue in AdminTraders.jsx. Existing
      // rows default to 'approved' in the DB (see the v2.77 migration in
      // adminMigrations.ts) so nothing already live disappears; new venues
      // are created with status: "pending" explicitly by the client
      // (MerchantRequest.jsx), same pattern as WaterBody above.
      { name: "status", type: "enum", required: false, enumValues: ["pending", "approved", "rejected"] },
      // v3.06 — free-text working hours (e.g. "09:00 - 18:00"), shown
      // publicly on CommercialVenues.jsx. See TraderVenues.jsx.
      { name: "working_hours", type: "string", required: false },
      // v3.26 — same logo-size options CustomAd.logo_size offers (see
      // there): meaningful once this venue's logo can appear inside an
      // actual ad banner (CustomAds.jsx's "Търговци в банера" — the ad
      // snapshots this value at the time it's attached, see
      // custom_ads.merchants below).
      { name: "logo_size", type: "enum", required: false, enumValues: ["16x16", "32x16", "48x16", "auto"] },
      // v3.44 — optional ad-style content, matching what a manually-created
      // custom ad already has (title/description/link — `name` above
      // already serves as the title). Lets this venue, once attached to a
      // merchant banner (CustomAds.jsx), show its own description and an
      // outbound link instead of just logo + name. See AdBannerItem.jsx.
      { name: "ad_description", type: "string", required: false },
      { name: "ad_link", type: "string", required: false },
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