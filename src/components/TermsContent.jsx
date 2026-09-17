import React from "react";
import { useLanguage } from "@/lib/i18n";

// v2.97/2.98 — the actual legal text, factored out of src/pages/Terms.jsx so
// it can be reused verbatim inside the mandatory acceptance gate
// (TermsGate.jsx) without duplicating/drifting the two copies apart.
// v2.99 — now driven by the i18n dictionary (terms.* keys) so it is
// translated into all 17 languages the app supports instead of being
// hardcoded Bulgarian text.
export default function TermsContent() {
  const { t } = useLanguage();

  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <>
      <p className="text-xs text-slate-400 dark:text-muted-foreground">
        {t("terms.lastUpdated")}
      </p>

      {sections.map((n) => (
        <section key={n} className="space-y-1.5">
          <h2 className="font-semibold text-slate-800 dark:text-foreground">
            {t(`terms.s${n}.title`)}
          </h2>
          <p>{t(`terms.s${n}.p1`)}</p>
          {n === 2 && <p>{t("terms.s2.p2")}</p>}
        </section>
      ))}
    </>
  );
}
