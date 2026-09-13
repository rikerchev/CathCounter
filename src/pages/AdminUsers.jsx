import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { ShieldCheck, UserPlus, Users, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, toggleRole, highestRole, hasRole } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";
import { parseMenuItems } from "@/lib/menuItems";
import MenuGroupDialog from "@/components/MenuGroupDialog";

const ALL_ROLES = ["admin", "water_owner", "advertiser"];

export default function AdminUsers() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [tab, setTab] = useState("users");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    loadUsers();
    loadGroups();
  }, []);

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
      const currentRoles = Array.isArray(u.roles) ? u.roles : (u.role && u.role !== "user" ? [u.role] : []);
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
              {users.map((u) => {
                const userRoles = Array.isArray(u.roles) ? u.roles : (u.role && u.role !== "user" ? [u.role] : []);
                const isAdmin = hasRole(u, "admin");
                return (
                  <div key={u.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-foreground truncate">
                          {u.full_name || u.email}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
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