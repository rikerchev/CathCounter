import React from "react";

export default function AuthLayout({ icon: Icon, appName, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
            <Icon className="w-7 h-7 text-white" aria-hidden="true" />
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
            Общи условия
          </a>
        </p>
      </div>
    </div>
  );
}