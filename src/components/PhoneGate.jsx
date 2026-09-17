import React, { useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// v3.05 — blocks the whole app (rendered by App.jsx's AuthenticatedApp, right
// after the terms gate, in place of <Routes>) until a logged-in user has a
// phone number on file. Covers EVERY account that is missing one — both
// brand-new accounts that somehow reached this point without a phone (a
// Google sign-in has no phone of its own to carry over — see
// server/routes/auth.ts's google/callback) and every pre-v3.03 account that
// registered before the phone field existed at all. Mirrors TermsGate.jsx's
// pattern exactly (fixed full-screen overlay, single required field, save
// then re-check auth, logout escape hatch).
//
// App.jsx only renders this once "phone" is actually a real column in the
// DB row for this user (`"phone" in user`) — not just once it's empty —
// so a fresh code deploy can never lock everyone out (admin included) before
// the v3.03-user-phone migration has been applied by the admin. See
// adminMigrations.ts / middleware/auth.ts for the same schema-gap-tolerant
// pattern used elsewhere.
export default function PhoneGate() {
  const { checkUserAuth, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await base44.auth.updateMe({ phone: phone.trim() });
      await checkUserAuth();
    } catch (err) {
      setError(err.message || "Неуспешно записване на телефона. Опитайте отново.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-sky-50 via-white to-cyan-50 dark:from-background dark:via-background dark:to-background overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Phone className="w-6 h-6 text-cyan-600" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Телефонен номер</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-muted-foreground">
          Моля въведете телефонен номер, за да продължите. Той се показва само на организатора на
          състезание/резервация, в която участвате, за директна връзка при нужда.
        </p>

        <form onSubmit={handleSave} className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm space-y-3">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Вашият телефон"
            autoFocus
            className="w-full min-h-[48px] px-3 rounded-xl border border-slate-200 dark:border-border dark:bg-background text-base"
          />
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={!phone.trim() || submitting}
            className="w-full min-h-[48px] rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? "Записване..." : "Запази и продължи"}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-xs text-slate-400 dark:text-muted-foreground hover:underline"
          >
            Изход
          </button>
        </form>
      </div>
    </div>
  );
}
