import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { ShieldCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export default function AdminWaterBodies() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const all = await base44.entities.WaterBody.list();
      setRequests(all || []);
    } catch (e) {
      toast({ title: t("wb.errorLoading"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(wb, status) {
    try {
      await base44.entities.WaterBody.update(wb.id, { status });
      if (status === "approved" && wb.created_by_id) {
        try {
          const users = await base44.asServiceRole.entities.User.filter({ id: wb.created_by_id });
          const u = users && users[0];
          if (u) {
            const currentRoles = Array.isArray(u.roles) ? u.roles : [];
            const newRoles = currentRoles.includes("water_owner") ? currentRoles : [...currentRoles, "water_owner"];
            const newRole = u.role === "admin" ? "admin" : "water_owner";
            await base44.asServiceRole.entities.User.update(u.id, { roles: newRoles, role: newRole });
          }
        } catch (e) {
          console.error("Failed to update user role:", e);
        }
      }
      toast({ title: status === "approved" ? t("awb.approved") : t("awb.rejected") });
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

  const pending = requests.filter((w) => w.status === "pending");
  const others = requests.filter((w) => w.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-cyan-600" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("awb.title")}</h1>
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
              pending.map((w) => (
                <div key={w.id} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm">
                  <h3 className="font-bold text-slate-800 dark:text-foreground">{w.name}</h3>
                  <p className="text-xs text-slate-400">{w.location}</p>
                  <div className="mt-2 text-sm text-slate-600 dark:text-muted-foreground space-y-1">
                    {w.owner_name && <p>{t("awb.owner")}: {w.owner_name}</p>}
                    {w.contact_phone && <p>{t("awb.phone")}: {w.contact_phone}</p>}
                    {w.contact_email && <p>{t("awb.email")}: {w.contact_email}</p>}
                    {w.fish_population && <p>{t("awb.population")}: {w.fish_population}</p>}
                    {w.usage_conditions && <p>{t("awb.conditions")}: {w.usage_conditions}</p>}
                    <div className="flex gap-3 text-xs text-slate-400">
                      {w.max_depth != null && <span>{t("awb.depth")}: {w.max_depth}м</span>}
                      {w.capacity && <span>{t("awb.capacity")}: {w.capacity}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button onClick={() => setStatus(w, "approved")} size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[40px]">
                      <Check className="w-4 h-4 mr-1" /> {t("awb.approve")}
                    </Button>
                    <Button onClick={() => setStatus(w, "rejected")} variant="outline" size="sm" className="min-h-[40px]">
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
              {others.map((w) => (
                <div key={w.id} className="rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-slate-800 dark:text-foreground">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.location}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    w.status === "approved"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {w.status === "approved" ? t("awb.statusApproved") : t("awb.statusRejected")}
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