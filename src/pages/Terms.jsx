import React from "react";
import { Link } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import TermsContent from "@/components/TermsContent";

// v2.97 — "Общи условия" (Terms & Conditions / Privacy notice). Deliberately
// a standalone route OUTSIDE the authenticated <Layout> (see App.jsx) so it
// is reachable without logging in — a visitor should be able to read it
// before registering, and it should keep working even if a session expires.
// The actual legal text lives in TermsContent.jsx (v2.98), shared verbatim
// with the mandatory acceptance gate (TermsGate.jsx) so both copies can
// never drift apart.
export default function Terms() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-cyan-50 dark:from-background dark:via-background dark:to-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-600" />
            <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Общи условия и поверителност</h1>
          </div>
          <Link
            to={isAuthenticated ? "/" : "/login"}
            className="flex items-center gap-1 text-sm text-cyan-700 dark:text-cyan-400 hover:underline min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" /> Назад
          </Link>
        </div>

        <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-5 shadow-sm space-y-5 text-sm leading-relaxed text-slate-700 dark:text-muted-foreground">
          <TermsContent />
        </div>
      </div>
    </div>
  );
}
