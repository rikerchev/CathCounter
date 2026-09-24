import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, WifiOff } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// v3.60 — see the matching comment in Register.jsx: this page isn't on the
// translation system, so this stays hardcoded Bulgarian too.
const NETWORK_ERROR_MESSAGE = "Няма връзка с интернет. Проверете връзката си и опитайте отново.";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  // v3.60 — see the matching comment/hook use in Login.jsx.
  const isOnline = useOnlineStatus();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNetworkError(false);
    // v3.60 — a local flag, not the `networkError` state: `finally` below
    // runs in this same closure before a state update from the catch
    // block has actually re-rendered, so reading the state var there would
    // see its stale, pre-update value every time.
    let wasNetworkError = false;
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch (err) {
      // This deliberately swallows every OTHER error and always shows
      // "success" (see the comment on the `sent` branch below) so a
      // failed attempt never reveals whether an email is registered. A
      // network error is different: the request never even reached the
      // server, so showing "success" here isn't hiding anything about the
      // email — it's just false. Only this one case gets its own message.
      if (err?.isNetworkError) {
        wasNetworkError = true;
        setNetworkError(true);
      }
      // Every other failure: fall through to "success" as before.
    } finally {
      setLoading(false);
      if (!wasNetworkError) setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Възстановяване на парола"
      subtitle="Ще ви изпратим линк за възстановяване"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Обратно към входа
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-foreground text-center">
          Ако съществува профил с този имейл, ще получите линк за възстановяване на паролата скоро.
        </p>
      ) : (
        <>
          {/* v3.60 — proactive: the browser already knows it's offline, shown
              before the person even submits. */}
          {!isOnline && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              {NETWORK_ERROR_MESSAGE}
            </div>
          )}
          {/* v3.60 — reactive: the request just failed to reach the server.
              The form stays visible (unlike the anti-enumeration "sent"
              success view) so the person can retry once they're back online. */}
          {networkError && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              {NETWORK_ERROR_MESSAGE}
            </div>
          )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Имейл адрес</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Изпращане...
                </>
                ) : (
                "Изпрати линк"
                )}
          </Button>
        </form>
        </>
      )}
    </AuthLayout>
  );
}