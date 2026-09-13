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
} from "lucide-react";
import { LanguageSelector, useLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import AdBanner from "@/components/AdBanner";
import BottomAdBanner from "@/components/BottomAdBanner";
import InstallAppBanner from "@/components/InstallAppBanner";
import SyncStatus from "@/components/SyncStatus";
import NotificationsBell from "@/components/NotificationsBell";
import { APP_VERSION } from "@/lib/version";
import { hasRole, hasAnyRole } from "@/lib/roles";
import { useRodTimerMonitor } from "@/hooks/useRodTimerMonitor";
import { ALL_MENU_ITEMS, parseMenuItems, isMenuItemAllowed } from "@/lib/menuItems";

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
  { to: "/water-bodies", labelKey: "nav.waterBodies", icon: Waves },
  { to: "/competitions", labelKey: "nav.competitions", icon: Medal },
  { to: "/water-body-management", labelKey: "nav.myWaterBodies", icon: Settings2, waterOwnerOnly: true },
  { to: "/sector-reservations", labelKey: "nav.reservations", icon: CalendarCheck },
  { to: "/admin-users", labelKey: "nav.adminUsers", icon: ShieldCheck, adminOnly: true },
  { to: "/admin-setup", labelKey: "nav.adminSetup", icon: Settings, adminOnly: true },
  { to: "/admin-water-bodies", labelKey: "nav.approveWaterBodies", icon: ShieldCheck, adminOnly: true },
  { to: "/admin-role-requests", labelKey: "nav.roleRequests", icon: UserCog, adminOnly: true },
  { to: "/admin-data-export", labelKey: "nav.dataExport", icon: Download, adminOnly: true },
  { to: "/admin-translations", labelKey: "nav.translations", icon: Languages, adminOnly: true },
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

function NavContent({ onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [adMenuOpen, setAdMenuOpen] = useState(false);
  const [invMenuOpen, setInvMenuOpen] = useState(false);
  const [allowedPaths, setAllowedPaths] = useState([]);

  const isAdmin = hasRole(user, "admin");

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

  const invItems = navItems.filter((item) => item.group === "inventory" && isMenuItemAllowed(item.to, allowedPaths, isAdmin));
  const mainItems = navItems.filter((item) => !item.group && !item.profileItem && isMenuItemAllowed(item.to, allowedPaths, isAdmin));
  const profileItem = navItems.find((item) => item.profileItem);
  const activeSessionIndex = mainItems.findIndex((item) => item.to === "/active-session");
  const mainItemsBefore = activeSessionIndex >= 0 ? mainItems.slice(0, activeSessionIndex + 1) : mainItems;
  const mainItemsAfter = activeSessionIndex >= 0 ? mainItems.slice(activeSessionIndex + 1) : [];

  const renderNavLink = (item) => {
    const { to, labelKey, label, icon: Icon, end, adminOnly, waterOwnerOnly, advertiserOnly } = item;
    if (adminOnly && !hasRole(user, "admin")) return null;
    if (waterOwnerOnly && !hasAnyRole(user, ["water_owner", "admin"])) return null;
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

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {mainItemsBefore.map((item) => renderNavLink(item))}

      {invItems.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setInvMenuOpen(!invMenuOpen)}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground transition-colors min-h-[48px]"
          >
            <Boxes className="w-4 h-4" />
            {t("nav.inventory")}
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${invMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {invMenuOpen && (
            <div className="ml-4 mt-1 border-l border-slate-100 dark:border-border pl-3 space-y-1">
              {invItems.map((item) => renderNavLink(item))}
            </div>
          )}
        </div>
      )}

      {mainItemsAfter.map((item) => renderNavLink(item))}

      {visibleAdItems.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setAdMenuOpen(!adMenuOpen)}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground transition-colors min-h-[48px]"
          >
            <Megaphone className="w-4 h-4" />
            {t("nav.ads")}
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${adMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {adMenuOpen && (
            <div className="ml-4 mt-1 border-l border-slate-100 dark:border-border pl-3 space-y-1">
              {visibleAdItems.map(({ to, labelKey, icon: Icon }) => (
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
              ))}
            </div>
          )}
        </div>
      )}

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
  useRodTimerMonitor();

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
          <NavContent />
        </div>
        <div className="px-3 py-3 border-t border-slate-100 dark:border-border flex items-center justify-between gap-2">
           <div className="flex items-center gap-2">
              <NotificationsBell />
              <ThemeToggle />
              <LanguageSelector />
            </div>
            <span className="text-[10px] text-slate-400 dark:text-muted-foreground">v{APP_VERSION}</span>
         </div>
        </aside>

      {/* Sticky top group: mobile header + top ad banners scroll and stick
          together as ONE unit (see AdBanner.jsx's own comment for why —
          this is what replaced a hardcoded pixel offset that assumed the
          header was always exactly one fixed height). `env(safe-area-
          inset-top)` padding lives on the header itself, inside this
          sticky wrapper, so its own background fills the notch/status-bar
          area on devices that have one, instead of leaving a transparent
          gap or letting content start underneath it. */}
      <div className="sticky top-0 z-30">
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
              <NavContent onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-border flex-shrink-0 flex items-center justify-between gap-2">
              <LanguageSelector />
              <span className="text-[10px] text-slate-400 dark:text-muted-foreground">v{APP_VERSION}</span>
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
      <SyncStatus />
    </div>
  );
}