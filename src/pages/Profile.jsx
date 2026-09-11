import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { User, MapPin, Bell, Plus, Trash2, Loader2, Crown, Sparkles, LogOut, KeyRound, Mail, ShieldCheck, Loader } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { usePremium } from "@/hooks/usePremium";
import { useAuth } from "@/lib/AuthContext";
import { ROLE_LABELS } from "@/lib/roles";

const loadLocations = () => {
  try {
    return JSON.parse(localStorage.getItem("defaultLocations")) || [];
  } catch {
    return [];
  }
};

export default function Profile() {
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const { isPremium, activatePremium, deactivatePremium } = usePremium();
  const { logout } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sendingPasswordEmail, setSendingPasswordEmail] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    logout(true);
  };

  const handleSetPassword = async () => {
    if (!user?.email) return;
    setSendingPasswordEmail(true);
    try {
      await base44.auth.resetPasswordRequest(user.email);
      toast({ title: t("profile.passwordEmailSent") });
    } catch {
      toast({ title: t("profile.passwordEmailSent") });
    } finally {
      setSendingPasswordEmail(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("premium") === "success") {
      activatePremium();
      toast({ title: t("ads.premiumActive") });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleUpgrade = async () => {
    if (window.self !== window.top) {
      toast({ title: t("ads.iframeBlocked"), variant: "destructive" });
      return;
    }
    setUpgrading(true);
    try {
      let clientId = localStorage.getItem("client_reference_id");
      if (!clientId) {
        clientId = crypto.randomUUID();
        localStorage.setItem("client_reference_id", clientId);
      }
      const origin = window.location.origin;
      const response = await base44.functions.invoke("create-checkout-session", {
        client_reference_id: clientId,
        success_url: `${origin}/profile?premium=success`,
        cancel_url: `${origin}/profile?premium=cancel`,
      });
      window.location.href = response.data.url;
    } catch {
      toast({ title: t("ads.checkoutFailed"), variant: "destructive" });
    } finally {
      setUpgrading(false);
    }
  };
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [defaultLocations, setDefaultLocations] = useState(loadLocations);
  const [newLocation, setNewLocation] = useState("");
  const [myRoleRequests, setMyRoleRequests] = useState([]);
  const [showRoleRequest, setShowRoleRequest] = useState(false);
  const [roleRequestForm, setRoleRequestForm] = useState({ requested_role: "water_owner", reason: "" });
  const [submittingRoleRequest, setSubmittingRoleRequest] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("notifications")) || { catchReminders: true, sessionSummary: false };
    } catch {
      return { catchReminders: true, sessionSummary: false };
    }
  });

  const loadUser = useCallback(async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      setFullName(u.full_name || "");
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const loadMyRoleRequests = useCallback(async () => {
    if (!user) return;
    try {
      const all = await base44.entities.RoleRequest.list("-created_date", 50);
      setMyRoleRequests((all || []).filter((r) => r.user_email === user.email));
    } catch {
      // non-blocking
    }
  }, [user]);

  useEffect(() => { loadMyRoleRequests(); }, [loadMyRoleRequests]);

  async function submitRoleRequest(e) {
    e.preventDefault();
    setSubmittingRoleRequest(true);
    try {
      await base44.entities.RoleRequest.create({
        requested_role: roleRequestForm.requested_role,
        user_email: user.email,
        user_name: user.full_name || "",
        reason: roleRequestForm.reason,
        status: "pending",
      });
      toast({ title: t("profile.requestSent") });
      setShowRoleRequest(false);
      setRoleRequestForm({ requested_role: "water_owner", reason: "" });
      await loadMyRoleRequests();
    } catch (e) {
      toast({ title: t("awb.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmittingRoleRequest(false);
    }
  }
  useEffect(() => { localStorage.setItem("defaultLocations", JSON.stringify(defaultLocations)); }, [defaultLocations]);
  useEffect(() => { localStorage.setItem("notifications", JSON.stringify(notifications)); }, [notifications]);

  const saveName = async () => {
    setSavingName(true);
    try {
      await base44.auth.updateMe({ full_name: fullName });
      setUser((u) => ({ ...u, full_name: fullName }));
      toast({ title: t("profile.nameUpdated") });
    } catch {
      toast({ title: t("profile.couldNotUpdate"), variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const addLocation = (e) => {
    e.preventDefault();
    if (!newLocation.trim()) return;
    setDefaultLocations((prev) => [...prev, newLocation.trim()]);
    setNewLocation("");
  };

  const removeLocation = (idx) => {
    setDefaultLocations((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("profile.title")}</h1>
        <p className="text-sm text-slate-400">{t("profile.subtitle")}</p>
      </div>

      {/* Display name */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("profile.displayName")}</h2>
        </div>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("profile.yourName")} />
        <Button onClick={saveName} disabled={savingName} className="bg-cyan-600 hover:bg-cyan-700 w-full">
          {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : t("profile.saveName")}
        </Button>
        {user?.email && <p className="text-xs text-slate-400">{t("profile.signedInAs")} {user.email}</p>}
      </div>

      {/* Default fishing locations */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("profile.defaultLocations")}</h2>
        </div>
        <form onSubmit={addLocation} className="flex gap-2">
          <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder={t("profile.addSpot")} className="h-9" />
          <Button type="submit" variant="outline" size="icon"><Plus className="w-4 h-4" /></Button>
        </form>
        <div className="space-y-1.5">
          {defaultLocations.length === 0 ? (
            <p className="text-xs text-slate-400">{t("profile.noLocations")}</p>
          ) : (
            defaultLocations.map((loc, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
                <span className="text-sm text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {loc}
                </span>
                <button onClick={() => removeLocation(idx)} className="text-slate-300 hover:text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Premium / Ads */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("ads.upgradeTitle")}</h2>
        </div>
        {isPremium ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50">
            <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-700">{t("ads.premiumActive")}</p>
              <p className="text-xs text-emerald-600">{t("ads.premiumDesc")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={deactivatePremium}>{t("common.cancel")}</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">{t("ads.upgradeDesc")}</p>
            <Button className="w-full bg-amber-500 hover:bg-amber-600" onClick={handleUpgrade} disabled={upgrading}>
              {upgrading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Crown className="w-4 h-4 mr-1" />} {t("ads.upgradeBtn")}
            </Button>
          </div>
        )}
      </div>

      {/* Set / Change Password */}
      {user?.email && (
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <KeyRound className="w-4 h-4 text-cyan-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-700">{t("profile.setPassword")}</p>
              <p className="text-xs text-slate-400">{t("profile.setPasswordDesc")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
            <Mail className="w-3.5 h-3.5" />
            {user.email}
          </div>
          <Button
            onClick={handleSetPassword}
            disabled={sendingPasswordEmail}
            variant="outline"
            className="w-full h-11"
          >
            {sendingPasswordEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            {t("profile.sendPasswordLink")}
          </Button>
        </div>
      )}

      {/* Role requests */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("profile.myRoles")}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(() => {
            const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role && user.role !== "user" ? [user.role] : []);
            if (userRoles.length === 0) return <p className="text-xs text-slate-400">{t("profile.userRole")}</p>;
            return userRoles.map((r) => (
              <span key={r} className="text-xs px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700 font-medium">
                {ROLE_LABELS[r] || r}
              </span>
            ));
          })()}
        </div>
        {myRoleRequests.filter((r) => r.status === "pending").length > 0 && (
          <div className="space-y-1">
            {myRoleRequests.filter((r) => r.status === "pending").map((r) => (
              <div key={r.id} className="text-xs text-amber-600 flex items-center gap-1">
                <Loader className="w-3 h-3" /> {t("profile.pendingRequest")}: {ROLE_LABELS[r.requested_role]}
              </div>
            ))}
          </div>
        )}
        {showRoleRequest ? (
          <form onSubmit={submitRoleRequest} className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("profile.role")}</Label>
              <select
                value={roleRequestForm.requested_role}
                onChange={(e) => setRoleRequestForm((f) => ({ ...f, requested_role: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="water_owner">{ROLE_LABELS.water_owner}</option>
                <option value="advertiser">{ROLE_LABELS.advertiser}</option>
                <option value="admin">{ROLE_LABELS.admin}</option>
              </select>
            </div>
            <Input
              value={roleRequestForm.reason}
              onChange={(e) => setRoleRequestForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t("profile.requestReason")}
              className="h-9"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={submittingRoleRequest} className="bg-cyan-600 hover:bg-cyan-700 h-9 text-xs flex-1">
                {submittingRoleRequest ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} {t("profile.send")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowRoleRequest(false)} className="h-9 text-xs">{t("ca.cancel")}</Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowRoleRequest(true)} className="min-h-[40px]">
            <Plus className="w-4 h-4 mr-1" /> {t("profile.requestNewRole")}
          </Button>
        )}
      </div>

      {/* Logout */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors font-medium text-sm min-h-[44px]"
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          {t("profile.logout")}
        </button>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t("profile.notifications")}</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">{t("profile.catchReminders")}</p>
              <p className="text-xs text-slate-400">{t("profile.catchRemindersDesc")}</p>
            </div>
            <Switch checked={notifications.catchReminders} onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, catchReminders: v }))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">{t("profile.sessionSummary")}</p>
              <p className="text-xs text-slate-400">{t("profile.sessionSummaryDesc")}</p>
            </div>
            <Switch checked={notifications.sessionSummary} onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, sessionSummary: v }))} />
          </div>
        </div>
      </div>
    </div>
  );
}