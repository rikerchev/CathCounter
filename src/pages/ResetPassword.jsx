import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle, WifiOff } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// v3.60 — see the matching comment in Register.jsx: this page isn't on the
// translation system, so this stays hardcoded Bulgarian too.
const NETWORK_ERROR_MESSAGE = "Няма връзка с интернет. Проверете връзката си и опитайте отново.";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // v3.60 — see the matching comment/hook use in Login.jsx.
  const isOnline = useOnlineStatus();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Паролите не съвпадат");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.isNetworkError ? NETWORK_ERROR_MESSAGE : (err.message || "Неуспешно възстановяване на парола"));
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Невалиден линк"
        subtitle="Този линк за възстановяване липсва или е невалиден"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Заявете нов линк
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Линкът, който използвахте, изглежда непълен. Моля, заявете нов имейл за възстановяване на парола.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Нова парола"
      subtitle="Въведете новата си парола по-долу"
    >
      {!isOnline && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          {NETWORK_ERROR_MESSAGE}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Нова парола</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Потвърдете паролата</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Възстановяване...
            </>
          ) : (
            "Възстанови парола"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}