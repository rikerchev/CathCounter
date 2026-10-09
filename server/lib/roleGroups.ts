import { sql } from "../db.js";

// v3.29 — "role-bound" menu groups: when a user is approved for the
// "water_owner" role (labelled "Търговец" in the UI, and historically/still
// also called "собственик на водоем" — see src/lib/roles.js's ROLE_LABELS
// comment, the underlying role key never changed) or the "advertiser" role,
// their profile is auto-assigned to a shared, per-role menu_groups row
// instead of staying ungrouped. This gives the admin ONE place (Admin →
// Потребители → Групи, the existing group editor — src/components/
// MenuGroupDialog.jsx) to grant or take away menu access for that entire
// role at once, instead of having to configure every merchant/advertiser
// account individually.
//
// Every non-admin path from src/lib/menuItems.js's ALL_MENU_ITEMS — the
// baseline any ordinary logged-in user already sees when they have no
// menu_group_id at all (see menuItems.js's isMenuItemAllowed: "no group
// assigned = see everything"). This file can't import from src/ (separate
// build), so it's kept here as its own literal copy rather than a shared
// import; if a new item is ever added to ALL_MENU_ITEMS that should also be
// visible by default to these two groups, add it here too.
//
// waterOwnerOnly/advertiserOnly items (water-body-management, trader-venues,
// advertise, my-ad-requests) are deliberately included in BOTH groups'
// starting lists: src/components/Layout.jsx's own hasRole()/hasAnyRole()
// checks already hide each of those from whichever group's members don't
// actually hold that specific role, so listing them here is harmless for
// the other group — and for the group whose role they belong to, leaving
// them OUT would mean a newly auto-assigned advertiser (say) instantly
// losing access to their own "Реклами" screens the moment they're grouped,
// which is exactly the regression this list exists to avoid.
const BASELINE_PATHS = [
  "/", "/active-session", "/log-catch", "/catch-history", "/sessions",
  "/statistics", "/locations", "/personal-best", "/inventory/base-items",
  "/inventory/my-inventory", "/bait-inventory", "/commercial-venues",
  "/water-bodies", "/competitions", "/water-body-management", "/trader-venues",
  "/sector-reservations", "/advertise", "/my-ad-requests", "/contact-us",
  "/profile",
];
const BASELINE_MENU_ITEMS = BASELINE_PATHS.join(", ");

export const ROLE_GROUP_KEYS = ["water_owner", "advertiser"] as const;
export type RoleGroupKey = (typeof ROLE_GROUP_KEYS)[number];

// v3.117 — a THIRD system group, "user" ("Потребители"): every brand-new
// registration (see insertNewUser()/the Google-callback insert in
// routes/auth.ts) is now assigned here at creation time, instead of
// starting ungrouped (menu_group_id = NULL). Unlike water_owner/advertiser
// above, this one is never reached through the "newly granted role" path in
// routes/userEntity.ts — every account already "has" the implicit "user"
// role from the moment it exists, there's no approval/grant event for it —
// so it's deliberately kept OUT of ROLE_GROUP_KEYS (which that file's
// newly-granted-role detection loops over) and is instead applied directly
// at the two account-creation sites. Same starting menu list as the other
// two (BASELINE_MENU_ITEMS) — so, like them, assigning it changes nothing
// about what a new account can actually see; it only gives the admin one
// shared group (Admin → Потребители → Групи) to manage every ordinary
// user's menu access at once, instead of none at all.
export const DEFAULT_GROUP_KEY = "user" as const;
export type GroupKey = RoleGroupKey | typeof DEFAULT_GROUP_KEY;

export const ROLE_GROUP_DEFAULTS: Record<
  GroupKey,
  { name: string; description: string; menuItems: string }
> = {
  user: {
    name: "Потребители",
    description:
      "Автоматична група за всеки нов регистриран потребител (v3.117). Стартира с точно същия достъп, който вече вижда всеки обикновен потребител — добавете или махнете менюта тук само за тази група, важи за всички наведнъж. Акаунт, повишен до Рекламодател или Търговец, автоматично напуска тази група и преминава в своята собствена.",
    menuItems: BASELINE_MENU_ITEMS,
  },
  water_owner: {
    name: "Търговци (собственици на водоеми)",
    description:
      "Автоматична група за всеки одобрен Търговец / собственик на водоем или обект (v3.29). Стартира с точно същия достъп, който вече вижда всеки обикновен потребител — добавете или махнете менюта тук само за тази роля, важи за всички наведнъж.",
    menuItems: BASELINE_MENU_ITEMS,
  },
  advertiser: {
    name: "Рекламодатели",
    description:
      "Автоматична група за всеки одобрен Рекламодател (v3.29). Стартира с точно същия достъп, който вече вижда всеки обикновен потребител — добавете или махнете менюта тук само за тази роля, важи за всички наведнъж.",
    menuItems: BASELINE_MENU_ITEMS,
  },
};

// Looks up the system menu_groups row for this role/group key (created by
// the "v3.29-role-menu-groups" admin migration for water_owner/advertiser,
// and "v3.117-default-user-group" for "user"). If the relevant migration
// hasn't been applied yet on this database (role_key column doesn't exist),
// or the lookup fails for any other reason, returns null so the caller just
// skips auto-assignment instead of failing the request that's granting the
// role — the same best-effort, never-block-the-real-action pattern as
// withSafeColumns() in routes/userEntity.ts.
export async function findRoleGroupId(roleKey: GroupKey): Promise<string | null> {
  try {
    const rows = await sql<{ id: string }[]>`SELECT id FROM menu_groups WHERE role_key = ${roleKey}`;
    return rows[0]?.id ?? null;
  } catch (e) {
    if (e instanceof Error && /role_key/.test(e.message)) return null; // migration not applied yet
    console.error("findRoleGroupId error:", e);
    return null;
  }
}
