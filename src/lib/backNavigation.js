// v3.121 — "Back" follows the MENU HIERARCHY, not the list of pages visited.
//
// Before, the device/browser back button simply returned to whatever page was
// open before (Statistics → Sessions → Statistics → …), so after moving
// around a few times it bounced between sibling pages and never reached the
// menu. Now every page has one parent:
//   • a page inside a submenu (Склад, Реклами, Търговци) → the menu with that
//     submenu expanded (Home + `openMenuGroup`, see Layout.jsx);
//   • a detail page → the list it belongs to (catch details → history,
//     edit → details);
//   • any other menu page → Home;
//   • Home → nothing (back leaves the app, as usual).
// HierarchicalBack.jsx applies this to the browser's back button.

// Pages that live inside a collapsible submenu → which submenu.
const SUBMENU_OF = {
  "/inventory/base-items": "inventory",
  "/inventory/my-inventory": "inventory",
  "/bait-inventory": "inventory",
  "/water-body-management": "traders",
  "/trader-venues": "traders",
  "/advertise": "ads",
  "/my-ad-requests": "ads",
  "/custom-ads": "ads",
  "/admin-ad-slots": "ads",
  "/admin-ad-requests": "ads",
};

// Every page inside the main <Layout> (the routes in App.jsx). Anything else
// (login, register, terms, 404 …) keeps the browser's normal back behaviour.
const APP_PAGES = new Set([
  "/",
  "/active-session", "/log-catch", "/catch-history", "/sessions", "/catch-details",
  "/edit-catch", "/statistics", "/locations", "/personal-best", "/profile",
  "/commercial-venues", "/water-bodies", "/water-body-request", "/merchant-request",
  "/competitions", "/sector-reservations", "/contact-us",
  "/admin-users", "/admin-setup", "/admin-traders", "/admin-role-requests",
  "/admin-data-export", "/admin-translations",
  ...Object.keys(SUBMENU_OF),
]);

export function isAppPage(pathname) {
  return APP_PAGES.has(pathname);
}

/**
 * The parent of a page, as `{ to, state }` for navigate(), or null when the
 * page has none (Home) or isn't one of the app's menu pages.
 */
export function parentOf(pathname, search = "") {
  if (!isAppPage(pathname) || pathname === "/") return null;

  const group = SUBMENU_OF[pathname];
  if (group) return { to: "/", state: { openMenuGroup: group } };

  if (pathname === "/catch-details") return { to: "/catch-history", state: null };
  if (pathname === "/edit-catch") {
    const id = new URLSearchParams(search).get("id");
    return { to: id ? `/catch-details?id=${encodeURIComponent(id)}` : "/catch-history", state: null };
  }
  return { to: "/", state: null };
}

/** The chain Home → … → page, used to give a freshly opened deep link a stack. */
export function ancestorsOf(pathname, search = "") {
  const chain = [];
  let cur = parentOf(pathname, search);
  while (cur) {
    chain.unshift(cur);
    const [p, q] = cur.to.split("?");
    cur = parentOf(p, q ? `?${q}` : "");
  }
  return chain;
}
