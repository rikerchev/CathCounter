import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fish, Mail, Lock, Loader2, WifiOff } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// v3.60 — this page (unlike Login.jsx) doesn't go through the translation
// system at all — every string here is already hardcoded Bulgarian — so
// the network-error message below matches that existing style rather than
// introducing a lone translated string. See base44Client.js's apiFetch()
// for where isNetworkError actually gets set.
const NETWORK_ERROR_MESSAGE = "Няма връзка с интернет. Проверете връзката си и опитайте отново.";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // v3.03 — collected right after the terms checkbox (see the conditional
  // block below): Name so the account isn't just an email address, Phone so
  // whoever later registers this account for a competition already gives
  // its organizer a direct-contact option (see Competitions.jsx's handleRegister).
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  // v3.60 — see the matching comment/hook use in Login.jsx.
  const isOnline = useOnlineStatus();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Паролите не съвпадат");
      return;
    }
    if (!acceptedTerms) {
      setError("Трябва да приемете общите условия, за да продължите");
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      setError("Моля, въведете име и телефон");
      return;
    }
    setLoading(true);
    try {
      const result = await base44.auth.register({
        email, password, acceptedTerms,
        full_name: fullName.trim(),
        phone: phone.trim(),
      });
      if (result?.access_token) {
        // First account on a freshly set up database — created as admin
        // and already verified, so log straight in instead of asking for
        // an email confirmation code.
        base44.auth.setToken(result.access_token);
        window.location.href = safeReturnTo();
        return;
      }
      setShowOtp(true);
    } catch (err) {
      setError(err.isNetworkError ? NETWORK_ERROR_MESSAGE : (err.message || "Регистрацията е неуспешна"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.isNetworkError ? NETWORK_ERROR_MESSAGE : (err.message || "Невалиден код за потвърждение"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast({
        title: "Кодът е изпратен",
        description: "Проверете имейла си за новия код.",
      });
    } catch (err) {
      setError(err.isNetworkError ? NETWORK_ERROR_MESSAGE : (err.message || "Неуспешно изпращане на код"));
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", safeReturnTo());
  };

  if (showOtp) {
    return (
      <AuthLayout
        icon={Mail}
        title="Потвърдете имейла си"
        subtitle={`Изпратихме код до ${email}`}
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
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Потвърждение...
            </>
          ) : (
            "Потвърди"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Не получихте кода?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Изпрати отново
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Fish}
      appName="CatchCount"
      title="Създайте профил"
      subtitle="Регистрирайте се, за да започнете"
      footer={
        <>
          Вече имате профил?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Вход
          </Link>
        </>
      }
    >
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Продължи с Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">или</span>
        </div>
      </div>

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
          <Label htmlFor="email">Имейл</Label>
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
        <div className="space-y-2">
          <Label htmlFor="password">Парола</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-cyan-600 flex-shrink-0"
          />
          <span className="text-sm text-muted-foreground">
            Съгласен/на съм с{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              общите условия
            </a>{" "}
            и обработката на личните ми данни
          </span>
        </label>
        {/* v3.03 — shown right after accepting the terms, per the site
            owner's request: Name so the account isn't just an email, Phone
            so an organizer always has a direct-contact option for whoever
            this account later registers for a competition. */}
        {acceptedTerms && (
          <>
            <div className="space-y-2">
              <Label htmlFor="fullName">Име</Label>
              <Input
                id="fullName"
                autoComplete="name"
                placeholder="Име и фамилия"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-12"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="08XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12"
                required
              />
            </div>
          </>
        )}
        <Button
          type="submit"
          className="w-full h-12 font-medium"
          disabled={loading || !acceptedTerms || !fullName.trim() || !phone.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Създаване на профил...
            </>
          ) : (
            "Създай профил"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}