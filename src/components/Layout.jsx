import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Fish,
  LayoutDashboard,
  Timer,
  PlusCircle,
  History,
  CalendarRange,
  BarChart3,
  MapPin,
  Trophy,
  Boxes,
  User,
  Menu,
  X,
  Moon,
  Sun,
  Megaphone,
  ShieldCheck,
  Waves,
  Medal,
  Settings2,
  Settings,
  CalendarCheck,
  UserCog,
  ChevronDown,
  FileText,
  Package,
  ClipboardList,
  Download,
  Languages,
  Store,
  Mail,
} from "lucide-react";
import { LanguageSelector, useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import AdBanner from "@/components/AdBanner";
import BottomAdBanner from "@/components/BottomAdBanner";
import AdSenseLoader from "@/components/AdSenseLoader";
import InstallAppBanner from "@/components/InstallAppBanner";
import SyncStatus from "@/components/SyncStatus";
import NotificationsBell from "@/components/NotificationsBell";
import { APP_VERSION } from "@/lib/version";
import { hasRole, hasAnyRole } from "@/lib/roles";
import { useRodTimerMonitor } from "@/hooks/useRodTimerMonitor";
import { ALL_MENU_ITEMS, parseMenuItems, isMenuItemAllowed } from "@/lib/menuItems";
import { DEFAULT_MENU_ORDER, normalizeMenuOrder, applyOrder } from "@/lib/menuOrder";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/active-session", labelKey: "nav.activeSession", icon: Timer },
  { to: "/log-catch", labelKey: "nav.logCatch", icon: PlusCircle },
  { to: "/catch-history", labelKey: "nav.catchHistory", icon: History },
  { to: "/sessions", labelKey: "nav.sessions", icon: CalendarRange },
  { to: "/statistics", labelKey: "nav.statistics", icon: BarChart3 },
  { to: "/locations", labelKey: "nav.locations", icon: MapPin },
  { to: "/personal-best", labelKey: "nav.personalBest", icon: Trophy },
  { to: "/inventory/base-items", labelKey: "nav.baseItems", icon: Package, group: "inventory" },
  { to: "/inventory/my-inventory", labelKey: "nav.manualItems", icon: ClipboardList, group: "inventory" },
  { to: "/bait-inventory", labelKey: "nav.tackleInventory", icon: Boxes, group: "inventory" },
  // v2.71 — public "Търговски обекти" browse page (contact/website/logo of
  // active venues) — distinct from the "Търговски обекти" item inside the
  // Търговци dropdown below, which is the owner/admin's OWN management
  // screen (brochure QR + bonus ad-time). Same relationship as this
  // "Водоеми" item just below has to Търговци → Водоеми.
  { to: "/commercial-venues", labelKey: "nav.venues", icon: Store },
  { to: "/water-bodies", labelKey: "nav.waterBodies", icon: Waves },
  { to: "/competitions", labelKey: "nav.competitions", icon: Medal },
  { to: "/sector-reservations", labelKey: "nav.reservations", icon: CalendarCheck },
  { to: "/admin-users", labelKey: "nav.adminUsers", icon: ShieldCheck, adminOnly: true },
  { to: "/admin-setup", labelKey: "nav.adminSetup", icon: Settings, adminOnly: true },
  // v2.77 — replaces the old water-body-only approval screen: one merged
  // pending queue for water bodies + commercial venues, plus bonus ad-time,
  // brochure download and reassigning the owner (AdminTraders.jsx).
  { to: "/admin-traders", labelKey: "nav.adminTraders", icon: Store, adminOnly: true },
  { to: "/admin-role-requests", labelKey: "nav.roleRequests", icon: UserCog, adminOnly: true },
  { to: "/admin-data-export", labelKey: "nav.dataExport", icon: Download, adminOnly: true },
  { to: "/admin-translations", labelKey: "nav.translations", icon: Languages, adminOnly: true },
  // v2.97 — "Връзка с нас": visible to every logged-in user (no role flag),
  // same as Профил below. See src/pages/ContactUs.jsx.
  { to: "/contact-us", labelKey: "nav.contactUs", icon: Mail },
  { to: "/profile", labelKey: "nav.profile", icon: User, profileItem: true },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5 text-amber-400" />
      ) : (
        <Moon className="w-5 h-5 text-slate-600" />
      )}
    </button>
  );
}

const adNavItems = [
  { to: "/advertise", labelKey: "nav.advertise", icon: Megaphone, advertiserOnly: true },
  { to: "/my-ad-requests", labelKey: "nav.myAdRequests", icon: FileText, advertiserOnly: true },
  { to: "/custom-ads", labelKey: "nav.customAds", icon: Megaphone, adminOnly: true },
  { to: "/admin-ad-slots", labelKey: "nav.adSlots", icon: Megaphone, adminOnly: true },
  { to: "/admin-ad-requests", labelKey: "nav.adRequests", icon: Megaphone, adminOnly: true },
];

// v2.69 — "Търговци" group (formerly the single flat "Моите водоеми" link),
// renamed "Одобрени търговци" in v2.77: a confirmed Търговец's (water_owner
// role) own management screens for their OWN water bodies and commercial
// venues — brochure QR download lives here, see WaterBodyManagement.jsx /
// TraderVenues.jsx. v2.77 also removed the admin bypass this group used to
// have (an admin without the water_owner role no longer sees it) — an
// admin manages every merchant's objects from the separate, admin-only
// "Търговци" screen instead (nav.adminTraders / AdminTraders.jsx above).
const traderNavItems = [
  { to: "/water-body-management", labelKey: "nav.traderWaterBodies", icon: Settings2, waterOwnerOnly: true },
  { to: "/trader-venues", labelKey: "nav.traderVenues", icon: Store, waterOwnerOnly: true },
];

function NavContent({ onNavigate, menuOrder }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [adMenuOpen, setAdMenuOpen] = useState(false);
  const [traderMenuOpen, setTraderMenuOpen] = useState(false);
  const [invMenuOpen, setInvMenuOpen] = useState(false);
  const [allowedPaths, setAllowedPaths] = useState([]);

  const isAdmin = hasRole(user, "admin");
  const order = menuOrder || DEFAULT_MENU_ORDER;

  useEffect(() => {
    async function fetchGroup() {
      if (!user || isAdmin || !user.menu_group_id) {
        setAllowedPaths([]);
        return;
      }
      try {
        const g = await base44.entities.MenuGroup.get(user.menu_group_id);
        setAllowedPaths(parseMenuItems(g?.menu_items));
      } catch {
        setAllowedPaths([]);
      }
    }
    fetchGroup();
  }, [user, isAdmin]);

  const visibleAdItems = adNavItems.filter((item) => {
    if (item.adminOnly && !hasRole(user, "admin")) return false;
    if (item.advertiserOnly && !hasAnyRole(user, ["advertiser", "admin"])) return false;
    if (!isMenuItemAllowed(item.to, allowedPaths, isAdmin)) return false;
    return true;
  });

  const visibleTraderItems = traderNavItems.filter((item) => {
    if (item.waterOwnerOnly && !hasRole(user, "water_owner")) return false;
    if (!isMenuItemAllowed(item.to, allowedPaths, isAdmin)) return false;
    return true;
  });

  const invItems = navItems.filter((item) => item.group === "inventory" && isMenuItemAllowed(item.to, allowedPaths, isAdmin));
  const mainItems = navItems.filter((item) => !item.group && !item.profileItem && isMenuItemAllowed(item.to, allowedPaths, isAdmin));
  const profileItem = navItems.find((item) => item.profileItem);

  const renderNavLink = (item) => {
    const { to, labelKey, label, icon: Icon, end, adminOnly, waterOwnerOnly, advertiserOnly } = item;
    if (adminOnly && !hasRole(user, "admin")) return null;
    if (waterOwnerOnly && !hasRole(user, "water_owner")) return null;
    if (advertiserOnly && !hasAnyRole(user, ["advertiser", "admin"])) return false;
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
            isActive
              ? "bg-cyan-50 text-cyan-700 dark:bg-accent dark:text-cyan-400"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
          }`
        }
      >
        <Icon className="w-4 h-4" />
        {labelKey ? t(labelKey) : label}
      </NavLink>
    );
  };

  // Smaller-styled link, used only inside the "Реклами" submenu — matches
  // that submenu's original (pre-v2.88) look, unchanged.
  const renderSmallLink = ({ to, labelKey, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors min-h-[44px] ${
          isActive
            ? "bg-cyan-50 text-cyan-700 dark:bg-accent dark:text-cyan-400"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {t(labelKey)}
    </NavLink>
  );

  const renderGroupBlock = (key, group) => (
    <div className="mt-1" key={key}>
      <button
        onClick={() => group.setOpen(!group.open)}
        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground transition-colors min-h-[48px]"
      >
        <group.icon className="w-4 h-4" />
        {group.label}
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${group.open ? "rotate-180" : ""}`} />
      </button>
      {group.open && (
        <div className="ml-4 mt-1 border-l border-slate-100 dark:border-border pl-3 space-y-1">
          {group.items.map((item) => group.itemRenderer(item))}
        </div>
      )}
    </div>
  );

  // v2.88 — display order (admin-configurable, see src/lib/menuOrder.js):
  // orderedXxxItems reorder the items WITHIN each collapsible submenu;
  // `order.top` (a mix of real item paths and "group:<id>" placeholders for
  // whole submenus) then decides the top-level order via renderSlot below.
  // Anything not mentioned in `order` (e.g. a brand-new item, or a stale
  // saved order) is still rendered — appended at the end — so nothing is
  // ever silently hidden by an out-of-date saved order.
  const orderedInvItems = applyOrder(invItems, order.groups.inventory, (it) => it.to);
  const orderedTraderItems = applyOrder(visibleTraderItems, order.groups.traders, (it) => it.to);
  const orderedAdItems = applyOrder(visibleAdItems, order.groups.ads, (it) => it.to);

  const groupConfigs = {
    "group:inventory": {
      items: orderedInvItems, label: t("nav.inventory"), icon: Boxes,
      open: invMenuOpen, setOpen: setInvMenuOpen, itemRenderer: renderNavLink,
    },
    "group:traders": {
      items: orderedTraderItems, label: t("nav.approvedTraders"), icon: Store,
      open: traderMenuOpen, setOpen: setTraderMenuOpen, itemRenderer: renderNavLink,
    },
    "group:ads": {
      items: orderedAdItems, label: t("nav.ads"), icon: Megaphone,
      open: adMenuOpen, setOpen: setAdMenuOpen, itemRenderer: renderSmallLink,
    },
  };

  const itemByPath = new Map(mainItems.map((item) => [item.to, item]));

  const renderSlot = (key) => {
    if (key.startsWith("group:")) {
      const group = groupConfigs[key];
      if (!group || group.items.length === 0) return null;
      return renderGroupBlock(key, group);
    }
    const item = itemByPath.get(key);
    return item ? renderNavLink(item) : null;
  };

  const orderedTopKeys = new Set(order.top);
  // Safety net: a visible main item whose path isn't in the saved/known
  // order (see the module comment above) still shows up, at the end.
  const extraMainItems = mainItems.filter((item) => !orderedTopKeys.has(item.to));

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {order.top.map((key) => renderSlot(key))}
      {extraMainItems.map((item) => renderNavLink(item))}

      {profileItem && (
        <div className="mt-auto pt-2 border-t border-slate-100 dark:border-border">
          {renderNavLink(profileItem)}
        </div>
      )}
    </nav>
  );
}

export default function Layout() {
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  // v2.88 — admin-configurable menu order, fetched once here (not per
  // NavContent instance — there are two, desktop + mobile) and passed down.
  // Falls back to DEFAULT_MENU_ORDER (today's hand-authored order) until
  // the fetch resolves, and stays on it if nothing's been saved yet or the
  // request fails — never blocks rendering the menu.
  const [menuOrder, setMenuOrder] = useState(DEFAULT_MENU_ORDER);
  useRodTimerMonitor();

  useEffect(() => {
    let cancelled = false;
    base44.settings.getMenuOrder()
      .then((data) => { if (!cancelled) setMenuOrder(normalizeMenuOrder(data?.order)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = scrollbarWidth + "px";
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [mobileOpen]);

  // No overflow-x-hidden on the root div below — it's on html/body
  // (src/index.css) instead. An overflow value other than "visible" on a
  // wrapper div like this one breaks position:sticky for descendants (the
  // ad banner), even though the div never visibly scrolls on its own.
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-cyan-50 dark:from-background dark:via-background dark:to-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-slate-100 dark:bg-card dark:border-border">
        <Link to="/" className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-accent transition-colors">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Fish className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-800 dark:text-foreground">{t("app.name")}</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavContent menuOrder={menuOrder} />
        </div>
        <div className="px-3 py-3 border-t border-slate-100 dark:border-border flex items-center justify-between gap-2">
           <div className="flex items-center gap-2">
              <NotificationsBell />
              <ThemeToggle />
              <LanguageSelector />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {/* v2.98 — always-reachable link to the Общи условия, next to
                  the app version, on both the desktop sidebar and the mobile
                  menu footer below. See src/pages/Terms.jsx. */}
              <Link to="/terms" className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline">
                {t("nav.terms")}
              </Link>
              <span className="text-[10px] text-slate-400 dark:text-muted-foreground">v{APP_VERSION}</span>
            </div>
         </div>
        </aside>

      {/* Sticky top group: mobile header + top ad banners scroll and stick
          together as ONE unit (see AdBanner.jsx's own comment for why —
          this is what replaced a hardcoded pixel offset that assumed the
          header was always exactly one fixed height). `env(safe-area-
          inset-top)` padding lives on the header itself, inside this
          sticky wrapper, so its own background fills the notch/status-bar
          area on devices that have one, instead of leaving a transparent
          gap or letting content start underneath it.

          v3.32 — `lg:ml-60` added: on desktop the mobile header above is
          `lg:hidden`, so this wrapper used to contain only AdBanner, which
          has no offset of its own and was rendering edge-to-edge across the
          FULL window width — including the 240px column where the fixed
          sidebar (<aside>, just above, in normal flow with no z-index) also
          sits. Because this wrapper carries z-30, any banner tall enough
          (the AdSense "auto" unit especially — see AdSenseSlot.jsx) painted
          straight over the sidebar's logo and first nav links instead of
          appearing only in the content area to its right, exactly like
          <main> below (which already has this same `lg:ml-60`). */}
      <div className="sticky top-0 z-30 lg:ml-60">
        <header
          className="lg:hidden bg-white/80 backdrop-blur-md border-b border-slate-100 dark:bg-card/80 dark:border-border flex items-center justify-between px-4 pb-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
        >
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Fish className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-800 dark:text-foreground">{t("app.name")}</span>
          </Link>
          <div className="flex items-center gap-1">
             <NotificationsBell />
             <ThemeToggle />
             <button onClick={() => setMobileOpen(true)} className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-accent">
               <Menu className="w-5 h-5 text-slate-600 dark:text-muted-foreground" />
             </button>
           </div>
          </header>
        {/* Rendered once (not once per breakpoint) so the eligible-ads
            fetch/impression-tracking below it only ever runs a single time
            per page — on desktop the header above just takes no space
            (`lg:hidden`), and this sticks at top:0 on its own. */}
        <AdBanner />
      </div>

      {/* Mobile menu */}
      {/* z-[60]: must render above the fixed "Синхронизиране..." pill
          (SyncStatus, z-50) — otherwise that pill, which is centered at the
          bottom of the screen, visually sits on top of this panel's bottom
          area (where the language selector lives) and blocks clicks on it. */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-white shadow-xl dark:bg-card flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-border flex-shrink-0">
              <span className="font-bold text-slate-800 dark:text-foreground">{t("nav.menu")}</span>
              <button onClick={() => setMobileOpen(false)} className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-accent">
                <X className="w-5 h-5 text-slate-600 dark:text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              <NavContent onNavigate={() => setMobileOpen(false)} menuOrder={menuOrder} />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-border flex-shrink-0 flex items-center justify-between gap-2">
              <LanguageSelector />
              <div className="flex flex-col items-end gap-0.5">
                <Link to="/terms" onClick={() => setMobileOpen(false)} className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline">
                  {t("nav.terms")}
                </Link>
                <span className="text-[10px] text-slate-400 dark:text-muted-foreground">v{APP_VERSION}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* paddingBottom reserves exactly as much room as the bottom ad
          stack currently occupies (0 when there isn't one) — see
          BottomAdBanner.jsx for how --bottom-ads-h gets set, so a fixed
          bottom banner never covers the last bit of page content. */}
      <main className="lg:ml-60" style={{ paddingBottom: "var(--bottom-ads-h, 0px)" }}>
        <InstallAppBanner />
        <Outlet />
      </main>

      <BottomAdBanner />
      <AdSenseLoader />
      <SyncStatus />
    </div>
  );
}