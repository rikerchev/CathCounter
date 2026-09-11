import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { ShieldCheck, Check, X, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, toggleRole, highestRole } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";

export default function AdminRoleRequests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.RoleRequest.list("-created_date", 200);
      setRequests(all || []);
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function approve(req) {
    try {
      const users = await base44.entities.User.filter({ email: req.user_email });
      const u = users && users[0];
      if (!u) {
        toast({ title: t("arr.userNotFound"), variant: "destructive" });
        return;
      }
      const currentRoles = Array.isArray(u.roles) ? u.roles : [];
      const newRoles = toggleRole(currentRoles, req.requested_role);
      const newRole = highestRole(newRoles);
      await base44.entities.User.update(u.id, { roles: newRoles, role: newRole });
      await base44.entities.RoleRequest.update(req.id, { status: "approved" });
      toast({ title: t("arr.roleApproved", { role: ROLE_LABELS[req.requested_role] }) });
      await load();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  async function reject(req) {
    try {
      await base44.entities.RoleRequest.update(req.id, { status: "rejected" });
      toast({ title: t("awb.rejected") });
      await load();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    }
  }

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">{t("awb.noAccess")}</p>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const others = requests.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("arr.title")}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("awb.pending")} ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400">{t("awb.noPending")}</p>
            ) : (
              pending.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 dark:text-foreground">{r.user_name || r.user_email}</p>
                      <p className="text-xs text-slate-400 truncate">{r.user_email}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 font-medium whitespace-nowrap">
                      {ROLE_LABELS[r.requested_role] || r.requested_role}
                    </span>
                  </div>
                  {r.reason && <p className="text-sm text-slate-600 dark:text-muted-foreground mt-2">{r.reason}</p>}
                  <div className="flex gap-2 mt-3">
                    <Button onClick={() => approve(r)} size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[40px]">
                      <Check className="w-4 h-4 mr-1" /> {t("awb.approve")}
                    </Button>
                    <Button onClick={() => reject(r)} variant="outline" size="sm" className="min-h-[40px]">
                      <X className="w-4 h-4 mr-1" /> {t("awb.reject")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {others.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("awb.resolved")} ({others.length})</h2>
              {others.map((r) => (
                <div key={r.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-800 dark:text-foreground truncate">{r.user_name || r.user_email}</p>
                    <p className="text-xs text-slate-400">{ROLE_LABELS[r.requested_role]}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    r.status === "approved"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {r.status === "approved" ? t("awb.statusApproved") : t("awb.statusRejected")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}