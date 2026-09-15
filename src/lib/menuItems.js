// All menu items available for group assignment.
// Paths must match the routes in src/App.jsx and navItems in Layout.jsx.
export const ALL_MENU_ITEMS = [
  { path: "/", labelKey: "nav.dashboard" },
  { path: "/active-session", labelKey: "nav.activeSession" },
  { path: "/log-catch", labelKey: "nav.logCatch" },
  { path: "/catch-history", labelKey: "nav.catchHistory" },
  { path: "/sessions", labelKey: "nav.sessions" },
  { path: "/statistics", labelKey: "nav.statistics" },
  { path: "/locations", labelKey: "nav.locations" },
  { path: "/personal-best", labelKey: "nav.personalBest" },
  { path: "/inventory/base-items", labelKey: "nav.baseItems" },
  { path: "/inventory/my-inventory", labelKey: "nav.manualItems" },
  { path: "/bait-inventory", labelKey: "nav.tackleInventory" },
  { path: "/water-bodies", labelKey: "nav.waterBodies" },
  { path: "/competitions", labelKey: "nav.competitions" },
  { path: "/water-body-management", labelKey: "nav.traderWaterBodies" },
  { path: "/trader-venues", labelKey: "nav.traderVenues" },
  { path: "/sector-reservations", labelKey: "nav.reservations" },
  { path: "/advertise", labelKey: "nav.advertise" },
  { path: "/my-ad-requests", labelKey: "nav.myAdRequests" },
  { path: "/custom-ads", labelKey: "nav.customAds" },
  { path: "/admin-ad-slots", labelKey: "nav.adSlots" },
  { path: "/admin-ad-requests", labelKey: "nav.adRequests" },
  { path: "/admin-users", labelKey: "nav.adminUsers" },
  { path: "/admin-setup", labelKey: "nav.adminSetup" },
  { path: "/admin-water-bodies", labelKey: "nav.approveWaterBodies" },
  { path: "/admin-role-requests", labelKey: "nav.roleRequests" },
  { path: "/admin-data-export", labelKey: "nav.dataExport" },
  { path: "/admin-translations", labelKey: "nav.translations" },
  { path: "/profile", labelKey: "nav.profile" },
];

// Parse comma-separated menu_items string into an array of paths
export function parseMenuItems(menuItemsStr) {
  if (!menuItemsStr) return [];
  return menuItemsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Check if a user should see a specific menu item based on their group
// Admins see everything. Users without a group see everything by default.
export function isMenuItemAllowed(path, allowedPaths, isAdmin) {
  if (isAdmin) return true;
  if (!allowedPaths || allowedPaths.length === 0) return true; // no group assigned = see everything
  return allowedPaths.includes(path);
}