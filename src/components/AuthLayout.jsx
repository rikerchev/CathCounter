import React from "react";
import { useLanguage } from "@/lib/i18n";

// v3.34 — the "Общи условия" link below used to be hardcoded in Bulgarian;
// now reuses the existing "nav.terms" key (already translated — the
// logged-in sidebar/mobile menu links to the same page with it, see
// Layout.jsx) so it matches whatever language Login.jsx (and any other page
// built on this layout) is currently showing.
// v3.66 — `useLogo` (instead of always trusting `icon`) picks the app's
// real brand artwork (same fish used for the PWA/home-screen icon — see
// public/icon-192.png) over the generic colored-badge+lucide-icon
// rendering, ONLY for the screens that are genuinely showing the app's
// identity (Login.jsx/Register.jsx's main welcome state). Every OTHER state
// built on this same layout — "check your email" (Mail), an error
// (AlertTriangle), "set a new password" (Lock) — keeps the plain icon
// badge exactly as before; those aren't the app logo, they're contextual
// status icons, so swapping them for a fish would be actively misleading.
export default function AuthLayout({ icon: Icon, useLogo, appName, title, subtitle, footer, children }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 overflow-hidden">
            {useLogo ? (
              <img src="/icon-192.png" alt={appName || ""} className="w-full h-full object-cover" />
            ) : (
              <Icon className="w-7 h-7 text-white" aria-hidden="true" />
            )}
          </div>
          {appName && (
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-600 mb-1">{appName}</p>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
        {/* v2.98 — always-visible link to the Terms & Conditions / privacy
            notice, even for a visitor who hasn't registered yet. See
            src/pages/Terms.jsx; the logged-in sidebar/mobile menu links to
            the same page (Layout.jsx footer). */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">
            {t("nav.terms")}
          </a>
        </p>
      </div>
    </div>
  );
}