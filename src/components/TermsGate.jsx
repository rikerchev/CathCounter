import React, { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import TermsContent from "@/components/TermsContent";

// v2.98 — blocks the whole app (rendered by App.jsx's AuthenticatedApp in
// place of <Routes>, so it works no matter which URL the user landed on)
// until a logged-in user has accepted the Terms & Conditions at least once.
// Covers EVERY account, not just new registrations: existing accounts (all
// created before v2.98) and Google sign-ins (which have no registration
// form/checkbox of their own) both have terms_accepted_at = NULL until they
// click through this screen — see server/routes/auth.ts's "accept-terms"
// action and middleware/auth.ts. Register.jsx additionally requires the
// checkbox at signup so most brand-new accounts never see this gate at all.
export default function TermsGate() {
  const { checkUserAuth, logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    if (!checked) return;
    setSubmitting(true);
    setError("");
    try {
      await base44.auth.acceptTerms();
      await checkUserAuth();
    } catch (err) {
      setError(err.message || "Неуспешно записване на съгласието. Опитайте отново.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-sky-50 via-white to-cyan-50 dark:from-background dark:via-background dark:to-background overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-cyan-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Общи условия и поверителност</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-muted-foreground">
          Преди да продължите да ползвате CatchCount, моля прегледайте и приемете общите условия по-долу.
        </p>

        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-5 text-sm leading-relaxed text-slate-700 dark:text-muted-foreground max-h-[55vh] overflow-y-auto">
          <TermsContent />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3 sticky bottom-4">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-cyan-600 flex-shrink-0"
            />
            <span className="text-sm text-slate-700 dark:text-foreground">
              Прочетох и се съгласявам с общите условия и начина на обработка на личните ми данни.
            </span>
          </label>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked || submitting}
            className="w-full min-h-[48px] rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? "Записване..." : "Приемам и продължи"}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-xs text-slate-400 dark:text-muted-foreground hover:underline"
          >
            Изход
          </button>
        </div>
      </div>
    </div>
  );
}
