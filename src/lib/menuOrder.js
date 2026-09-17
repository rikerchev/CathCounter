// src/lib/menuOrder.js — v2.88
//
// Admin-configurable ORDER of the sidebar/mobile nav menu (Admin →
// Настройка на интеграциите → "Режим на подреждане на менюто"). This module
// only decides DISPLAY ORDER — it never changes which items exist or who is
// allowed to see them. Layout.jsx's role checks / isMenuItemAllowed()
// (src/lib/menuItems.js) are completely untouched and still run on top of
// whatever order comes out of here; an item a given user isn't allowed to
// see is simply skipped when the order is applied, same as before.
//
// Saved as a JSON string under a single key, "MENU_ORDER", in the EXISTING
// generic app_settings key/value table (server/lib/settings.ts) — no new DB
// column/migration needed, since this value isn't tied to any one entity
// row. Read by EVERY signed-in user via GET /api/settings/menu-order
// (server/routes/publicSettings.ts — has to be public, not admin-only,
// because it drives what every user's own Layout.jsx renders). Written only
// through the existing admin-only PUT /api/admin/settings
// (base44.admin.updateSettings({ MENU_ORDER: JSON.stringify(order) })) —
// see src/pages/AdminSetup.jsx.
//
// Shape:
//   {
//     top: ["/", "/active-session", "group:inventory", "/log-catch", ...],
//     groups: { inventory: [...paths], traders: [...paths], ads: [...paths] }
//   }
// "top" lists every top-level nav slot IN ORDER — a real item's path, or a
// "group:<id>" placeholder standing in for one whole collapsible submenu
// (its own internal order lives in groups[<id>]). The always-pinned-last
// "Профил" link is deliberately NOT part of this — it stays fixed at the
// bottom of the menu regardless of the saved order (see Layout.jsx).

export const GROUP_DEFS = [
  { id: "inventory", labelKey: "nav.inventory" },
  { id: "traders", labelKey: "nav.approvedTraders" },
  { id: "ads", labelKey: "nav.ads" },
];

// Mirrors the app's original, hand-authored menu order (Layout.jsx's
// navItems / adNavItems / traderNavItems, before this feature existed) —
// this is what every user sees until an admin saves a custom order for the
// first time. Also doubles as the "known universe" of top-level slots /
// group members that normalizeMenuOrder() reconciles a saved order against —
// whoever adds a brand-new nav item to Layout.jsx later should add its path
// here too, in whichever group/position makes sense, or it will simply be
// appended at the end (see orderKnownKeys below) rather than lost.
export const DEFAULT_MENU_ORDER = {
  top: [
    "/", "/active-session",
    "group:inventory",
    "/log-catch", "/catch-history", "/sessions", "/statistics", "/locations", "/personal-best",
    "/commercial-venues", "/water-bodies", "/competitions", "/sector-reservations",
    "/admin-users", "/admin-setup", "/admin-traders", "/admin-role-requests", "/admin-data-export", "/admin-translations",
    "group:traders",
    "group:ads",
    "/contact-us",
  ],
  groups: {
    inventory: ["/inventory/base-items", "/inventory/my-inventory", "/bait-inventory"],
    traders: ["/water-body-management", "/trader-venues"],
    ads: ["/advertise", "/my-ad-requests", "/custom-ads", "/admin-ad-slots", "/admin-ad-requests"],
  },
};

// Reconciles a saved order (an array of keys) against the full known set of
// keys: known keys mentioned in the saved order keep their saved position;
// known keys NOT mentioned (a brand-new item added after the order was
// saved, or simply never in it) are appended at the end, in their default
// order. A saved order can therefore never hide an item.
function orderKnownKeys(knownKeys, savedOrder) {
  const seen = new Set();
  const out = [];
  for (const k of savedOrder || []) {
    if (knownKeys.includes(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of knownKeys) {
    if (!seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  return out;
}

// Takes whatever came back from GET /api/settings/menu-order's `order`
// field (null when nothing's been saved yet, or a possibly-partial/stale
// shape) and returns a complete, safe-to-render order.
export function normalizeMenuOrder(raw) {
  const top = orderKnownKeys(DEFAULT_MENU_ORDER.top, raw && Array.isArray(raw.top) ? raw.top : null);
  const groups = {};
  for (const [id, fullList] of Object.entries(DEFAULT_MENU_ORDER.groups)) {
    const saved = raw && raw.groups && Array.isArray(raw.groups[id]) ? raw.groups[id] : null;
    groups[id] = orderKnownKeys(fullList, saved);
  }
  return { top, groups };
}

export function cloneOrder(order) {
  return {
    top: order.top.slice(),
    groups: Object.fromEntries(Object.entries(order.groups).map(([k, v]) => [k, v.slice()])),
  };
}

// Reorders actual item OBJECTS (Layout.jsx's navItems/adNavItems/
// traderNavItems entries, which carry icons/role flags) to match a saved
// key order; any item not mentioned is appended at the end, in its original
// order — same "never hide an item" guarantee as orderKnownKeys above, but
// for real item objects instead of plain key strings.
export function applyOrder(items, orderKeys, keyOf) {
  const byKey = new Map(items.map((it) => [keyOf(it), it]));
  const seen = new Set();
  const out = [];
  for (const k of orderKeys || []) {
    const it = byKey.get(k);
    if (it && !seen.has(k)) {
      out.push(it);
      seen.add(k);
    }
  }
  for (const it of items) {
    const k = keyOf(it);
    if (!seen.has(k)) {
      out.push(it);
      seen.add(k);
    }
  }
  return out;
}
