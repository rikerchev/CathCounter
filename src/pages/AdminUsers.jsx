import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import {
  ShieldCheck, UserPlus, Users, Pencil, Trash2, Plus, Share2,
  Activity, Search, Download, Fish, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, toggleRole, highestRole, hasRole, effectiveRoles } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";
import { parseMenuItems } from "@/lib/menuItems";
import MenuGroupDialog from "@/components/MenuGroupDialog";
import { groupCatchesIntoSessions } from "@/lib/sessions";
import { parseCatchDate } from "@/lib/dateUtils";
import { exportWithHints } from "@/lib/excelUtils";

const ALL_ROLES = ["admin", "water_owner", "advertiser"];

// v3.83 — how far back "period" filters reach when judging user activity.
const ACTIVITY_PERIOD_OPTIONS = [
  { value: "all", label: "Винаги" },
  { value: "30d", label: "Последните 30 дни" },
  { value: "90d", label: "Последните 3 месеца" },
  { value: "year", label: "Тази година" },
];

function activityPeriodCutoff(period) {
  const now = new Date();
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null; // "all" — no cutoff
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [tab, setTab] = useState("users");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  // v3.51 — { [userId]: [{ source: "peer"|"venue"|"water_body", label, created_at }, ...] },
  // one entry per way that user was ever referred in. See
  // server/routes/referrals.ts's admin-sources action. Best-effort: a
  // failure here (e.g. a very old deployment without the v3.51 migration
  // applied yet) must never block the rest of the Users tab from loading.
  const [referralSources, setReferralSources] = useState({});
  // v3.83 — per-user activity stats (session/catch counts), so the admin can
  // tell which registered accounts are actually using the app rather than
  // just how many signed up. See loadActivityStats() below for the data
  // source and why SessionSync isn't it.
  const [catchesByUser, setCatchesByUser] = useState(null); // Map: userId -> catches[]
  const [activeNowIds, setActiveNowIds] = useState(new Set()); // userIds with a live session right now
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [exportingActivity, setExportingActivity] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityPeriod, setActivityPeriod] = useState("all");

  useEffect(() => {
    loadUsers();
    loadGroups();
    loadReferralSources();
    loadActivityStats();
  }, []);

  // v3.83 — "session" here reuses the exact grouping logic the user's own
  // Sessions.jsx page already shows them (consecutive catches with gaps
  // under 4h — see src/lib/sessions.js), so the admin's count and the
  // user's own count always agree. Deliberately NOT based on the
  // SessionSync entity: that table holds at most one row per device,
  // overwritten in place by every new session started on that device
  // within the same page load — a fine "resume on another device"
  // mechanism, but not a reliable history of past sessions (see the
  // reasoning in claude/user-activity-admin-view-3.83.md). Catches, once
  // synced, are permanent rows, so counting sessions from them is the
  // trustworthy source — with the one inherent caveat that a session whose
  // catches never made it to the server at all (fully offline device, never
  // synced) can't be counted here, since the server never saw it.
  async function loadActivityStats() {
    setLoadingActivity(true);
    try {
      // Admins bypass the owner-only row scoping server-side (see
      // server/routes/entities.ts), so these calls already return every
      // user's rows, not just the admin's own. Uses the /filter endpoint
      // rather than /list — list() caps at 1000 rows per call with no
      // pagination, while filter() has no cap (server does a full-table
      // scan), so this stays correct even once the app has grown past 1000
      // total catches.
      const [allCatches, activeSyncs] = await Promise.all([
        base44.entities.Catch.filter({}),
        base44.entities.SessionSync.filter({ is_active: true }),
      ]);

      const byUser = new Map();
      for (const c of allCatches || []) {
        const uid = c.created_by_id;
        if (!uid) continue;
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid).push(c);
      }
      setCatchesByUser(byUser);
      setActiveNowIds(new Set((activeSyncs || []).map((s) => s.created_by_id)));
    } catch (e) {
      // Non-fatal — the rest of the Users tab still works without activity stats.
    } finally {
      setLoadingActivity(false);
    }
  }

  // Session/catch count for one user, within the currently selected period.
  function getUserActivityStats(userId) {
    const catches = catchesByUser?.get(userId) || [];
    const cutoff = activityPeriodCutoff(activityPeriod);
    const filtered = cutoff
      ? catches.filter((c) => parseCatchDate(c).getTime() >= cutoff.getTime())
      : catches;
    const sessionCount = filtered.length ? groupCatchesIntoSessions(filtered).length : 0;
    return { sessionCount, catchCount: filtered.length };
  }

  async function handleExportActivity() {
    if (!catchesByUser) return;
    setExportingActivity(true);
    try {
      const rows = users.map((u) => {
        const stats = getUserActivityStats(u.id);
        return {
          email: u.email,
          full_name: u.full_name || "",
          role: ROLE_LABELS[u.role] || u.role || "user",
          session_count: stats.sessionCount,
          catch_count: stats.catchCount,
          active_now: activeNowIds.has(u.id) ? "Да" : "Не",
        };
      });
      exportWithHints(
        [{
          sheetName: "Активност",
          columns: [
            { key: "email", label: "Имейл" },
            { key: "full_name", label: "Име" },
            { key: "role", label: "Роля" },
            { key: "session_count", label: "Сесии" },
            { key: "catch_count", label: "Улови" },
            { key: "active_now", label: "Активен сега" },
          ],
          data: rows,
        }],
        `активност-потребители-${activityPeriod}.xlsx`
      );
      toast({ title: "Експортът е готов" });
    } catch (e) {
      toast({ title: "Грешка при експорт", description: e.message, variant: "destructive" });
    } finally {
      setExportingActivity(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await base44.entities.User.list();
      setUsers(data || []);
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function loadReferralSources() {
    try {
      const data = await base44.referrals.adminSources();
      setReferralSources(data || {});
    } catch (e) {
      // Non-fatal — see the state comment above.
    }
  }

  // v3.51 — plain-text label for one user's referral source(s), e.g.
  // "Регистриран чрез покана от Иван Иванов" or, when redeemed both ways
  // (peer AND merchant — see src/lib/referral.js), joined with "; ".
  function referredViaLabel(userId) {
    const entries = referralSources[userId];
    if (!entries || entries.length === 0) return null;
    return entries
      .map((e) => {
        const key =
          e.source === "peer" ? "menuGroup.referredViaPeer"
          : e.source === "venue" ? "menuGroup.referredViaVenue"
          : "menuGroup.referredViaWaterBody";
        const dt = new Date(e.created_at).toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        return `${t(key).replace("{name}", e.label)} · ${dt}`;
      })
      .join("; ");
  }

  async function loadGroups() {
    try {
      const data = await base44.entities.MenuGroup.list();
      setGroups(data || []);
    } catch (e) {
      // entity may not exist yet
    }
  }

  async function invite() {
    if (!email) return;
    try {
      await base44.users.inviteUser(email, role);
      toast({ title: t("menuGroup.inviteSent").replace("{email}", email) });
      setEmail("");
      await loadUsers();
    } catch (e) {
      toast({ title: t("menuGroup.inviteError"), description: e.message });
    }
  }

  async function toggleUserRole(u, roleToToggle) {
    try {
      // v2.76 — was only falling back to [u.role] when u.roles wasn't an
      // array at all; an account with roles: [] (array, just missing
      // "admin" in it) still lost its admin role the moment any other role
      // was toggled here. effectiveRoles() always folds the scalar role in.
      const currentRoles = effectiveRoles(u);
      const newRoles = toggleRole(currentRoles, roleToToggle);
      const newRole = highestRole(newRoles);
      await base44.entities.User.update(u.id, { roles: newRoles, role: newRole });
      toast({ title: t("menuGroup.rolesUpdated") });
      await loadUsers();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function assignGroup(u, groupId) {
    try {
      await base44.entities.User.update(u.id, { menu_group_id: groupId || null });
      toast({ title: t("menuGroup.groupAssigned") });
      await loadUsers();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function saveGroup(data) {
    try {
      if (editingGroup) {
        await base44.entities.MenuGroup.update(editingGroup.id, data);
      } else {
        await base44.entities.MenuGroup.create(data);
      }
      toast({ title: t("menuGroup.saved") });
      await loadGroups();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function deleteGroup(g) {
    if (!confirm(t("menuGroup.confirmDelete"))) return;
    try {
      await base44.entities.MenuGroup.delete(g.id);
      toast({ title: t("menuGroup.deleted") });
      await loadGroups();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function deleteUser(u) {
    if (!confirm(t("menuGroup.confirmDeleteUser").replace("{email}", u.email))) return;
    try {
      await base44.entities.User.delete(u.id);
      toast({ title: t("menuGroup.userDeleted") });
      await loadUsers();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  if (user && !hasRole(user, "admin")) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("menuGroup.noAccess")}</p>
      </div>
    );
  }

  const groupName = (gid) => {
    const g = groups.find((g) => g.id === gid);
    return g ? g.name : null;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("menuGroup.userManagement")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "users" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-accent dark:text-muted-foreground"
          }`}
        >
          {t("menuGroup.usersTab")}
        </button>
        <button
          onClick={() => setTab("groups")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "groups" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-accent dark:text-muted-foreground"
          }`}
        >
          {t("menuGroup.groupsTab")}
        </button>
      </div>

      {/* USERS TAB */}
      {tab === "users" && (
        <>
          {/* v3.83 — activity overview: how many registered accounts are
              actually using the app (logged at least one session), not just
              how many exist. */}
          <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">Активност на потребителите</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportActivity}
                disabled={loadingActivity || exportingActivity || !catchesByUser}
                className="min-h-[36px]"
              >
                {exportingActivity ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                Excel
              </Button>
            </div>

            {loadingActivity ? (
              <p className="text-xs text-slate-400">Зареждане на статистиката...</p>
            ) : (() => {
              const usersWithSessions = users.filter((u) => getUserActivityStats(u.id).sessionCount > 0).length;
              const totalSessions = users.reduce((sum, u) => sum + getUserActivityStats(u.id).sessionCount, 0);
              const totalCatches = users.reduce((sum, u) => sum + getUserActivityStats(u.id).catchCount, 0);
              const periodLabel = ACTIVITY_PERIOD_OPTIONS.find((p) => p.value === activityPeriod)?.label.toLowerCase();
              return (
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  <span className="font-semibold text-slate-800 dark:text-foreground">{usersWithSessions}</span> от {users.length} потребители
                  {" "}имат поне 1 сесия{activityPeriod !== "all" ? ` (${periodLabel})` : ""}
                  {" "}· общо {totalSessions} {totalSessions === 1 ? "сесия" : "сесии"} · {totalCatches} {totalCatches === 1 ? "улов" : "улова"}
                </p>
              );
            })()}

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Търсене по име или имейл..."
                  className="min-h-[40px] pl-9"
                />
              </div>
              <Select value={activityPeriod} onValueChange={setActivityPeriod}>
                <SelectTrigger className="min-h-[40px] sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-600" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-foreground">{t("menuGroup.inviteUser")}</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("menuGroup.emailPlaceholder")}
                className="min-h-[44px] flex-1"
              />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="min-h-[44px] sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{ROLE_LABELS.user}</SelectItem>
                  <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                  <SelectItem value="water_owner">{ROLE_LABELS.water_owner}</SelectItem>
                  <SelectItem value="advertiser">{ROLE_LABELS.advertiser}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={invite} className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
                <UserPlus className="w-4 h-4 mr-1" /> {t("menuGroup.invite")}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {users
                .filter((u) => {
                  const q = activitySearch.trim().toLowerCase();
                  if (!q) return true;
                  return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
                })
                .map((u) => {
                const userRoles = Array.isArray(u.roles) ? u.roles : (u.role && u.role !== "user" ? [u.role] : []);
                const isAdmin = hasRole(u, "admin");
                const activityStats = getUserActivityStats(u.id);
                const isActiveNow = activeNowIds.has(u.id);
                return (
                  <div key={u.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-foreground truncate">
                          {u.full_name || u.email}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        {/* v3.18 — the admin's own explicit ask: show each
                            user's phone here too, not just email. Only the
                            list/filter/get routes in userEntity.ts return
                            `phone` now (see that file's comment) — blank
                            when a user genuinely hasn't set one yet. */}
                        {u.phone && (
                          <p className="text-xs text-slate-400 truncate">{u.phone}</p>
                        )}
                        {/* v3.51 — who referred this user in (peer invite
                            or merchant QR/brochure) and when, if anyone —
                            see loadReferralSources()/referredViaLabel()
                            above. Blank for a user who registered directly,
                            with no invite/code involved at all. */}
                        {referredViaLabel(u.id) && (
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 flex items-center gap-1 mt-0.5">
                            <Share2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">{referredViaLabel(u.id)}</span>
                          </p>
                        )}
                        {/* v3.83 — session/catch activity stats, see
                            getUserActivityStats() above. */}
                        {!loadingActivity && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Fish className="w-3 h-3 shrink-0 text-cyan-500" />
                            <span>
                              {activityStats.sessionCount} {activityStats.sessionCount === 1 ? "сесия" : "сесии"}
                              {" · "}
                              {activityStats.catchCount} {activityStats.catchCount === 1 ? "улов" : "улова"}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isActiveNow && (
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                            title="Активна сесия точно сега"
                          />
                        )}
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400 whitespace-nowrap">
                          {ROLE_LABELS[u.role] || u.role || "user"}
                        </span>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => deleteUser(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-accent"
                            aria-label={t("menuGroup.deleteUser")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Group assignment */}
                    {!isAdmin && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-50 dark:border-border">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{t("menuGroup.group")}:</span>
                        <Select
                          value={u.menu_group_id || ""}
                          onValueChange={(v) => assignGroup(u, v === "none" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder={t("menuGroup.noGroup")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("menuGroup.noGroup")}</SelectItem>
                            {groups.map((g) => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Role toggles */}
                    {u.id !== user?.id && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-50 dark:border-border">
                        {ALL_ROLES.map((r) => {
                          const active = userRoles.includes(r);
                          return (
                            <button
                              key={r}
                              onClick={() => toggleUserRole(u, r)}
                              className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors ${
                                active
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-slate-100 text-slate-400 dark:bg-accent dark:text-muted-foreground"
                              }`}
                            >
                              {active ? "✓ " : "+ "}{ROLE_LABELS[r]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* GROUPS TAB */}
      {tab === "groups" && (
        <>
          <div className="flex justify-end">
            <Button
              onClick={() => { setEditingGroup(null); setGroupDialogOpen(true); }}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus className="w-4 h-4 mr-1" /> {t("menuGroup.createGroup")}
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">{t("menuGroup.noGroups")}</p>
              <p className="text-slate-300 text-sm mt-1">{t("menuGroup.noGroupsHint")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const itemCount = parseMenuItems(g.menu_items).length;
                return (
                  <div key={g.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                          <p className="text-sm font-medium text-slate-800 dark:text-foreground truncate">{g.name}</p>
                        </div>
                        {g.description && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{g.description}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {itemCount} {t("menuGroup.menuItems")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingGroup(g); setGroupDialogOpen(true); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-50 dark:hover:bg-accent"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteGroup(g)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-accent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <MenuGroupDialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        onSave={saveGroup}
        group={editingGroup}
      />
    </div>
  );
}